import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { readFile, writeFile } from "fs/promises";
import { Md5 as md5 } from "ts-md5";
import { sites as minimalsites } from "../src/utils/constants";
import {
  siteValidator,
  timetableEntryValidator,
  TimetableSession,
  timetableValidator,
} from "../src/utils/validators";

import util from "util";

const prisma = new PrismaClient();
const debug = true;

const key = process.env.ACTIVEINTIME_KEY;
const seven_days_later = new Date(Date.now() + 3600 * 1000 * 24 * 7)
  .toISOString()
  .split("T")[0];

function getDeepObject(obj: unknown) {
  return util.inspect(obj, {
    showHidden: false,
    depth: null,
    colors: true,
  });
}

// https://stackoverflow.com/questions/10011011/reading-a-local-json-file-in-node-js
async function readJSONFromFile(filename: string) {
  try {
    const result = JSON.parse(await readFile(filename, "utf-8"));
    return result;
  } catch (e) {
    console.log(typeof e);
    // if (e instanceof Error && e.code !== "ENOENT") {
    console.log(e);
    // await unlink(filename).catch((e) => {
    //   console.log(e);
    // });
    // }
  }
  return undefined;
}

// A basic function to return the results of an API call, and cache it for later
async function getDataFromAPI(url: string) {
  const digest = md5.hashStr(url);
  const filename = `${__dirname}/data/${digest}.json`;
  let result = await readJSONFromFile(filename);

  if (result === undefined) {
    if (debug) console.log(url);
    result = await axios.get(url).then((response) => response.data.response);
    await writeFile(filename, JSON.stringify(result)).catch((e) => {
      console.log(e);
    });
  }
  return result;
}

// Creates an inverted lookup map
// function getInverse(lookupMap: Map<number, Array<number>>) {
//   const inverse = new Map<number, number>();
//   lookupMap.forEach((value, key) => {
//     value.forEach((v) => {
//       inverse.set(v, key);
//     });
//   });
//   return inverse;
// }

// Keeping these in file scope. They are used in multiple functions
const siteTimetablesMap = new Map<number, Array<number>>();
// const facilities_seen = new Set<number>();

async function main() {
  await Promise.all(
    minimalsites.map((site) =>
      getDataFromAPI(
        `https://api.activeintime.com/v1/sites/${site.id}.json?key=${key}`
      )
    )
  )
    .then(async (responses) => {
      // Validate the responses
      const confirmedSites = responses.map((response) =>
        siteValidator.parse(response)
      );

      return await Promise.all(
        confirmedSites.map(async (site) => {
          siteTimetablesMap.set(
            site.id,
            site.timetables.map((t) => t.id)
          );
          return prisma.site.create({
            data: {
              site_id: site.id,
              name: site.name,
              timezone: site.timezone ?? "Europe/London",
              tldc_approved: site.tldc_approved,
              facilities: {
                create: site.facilities.map((facility) => ({
                  name: facility.primary_name,
                  length: facility.length,
                  facility_id: `${facility.id}_${site.id}`,
                  tldc_approved: facility.tldc_approved,
                })),
              },
              contact: {
                create: {
                  address_line_1: site.contact.address_line_1,
                  address_line_2: site.contact.address_line_2,
                  country: site.contact.country,
                  latitude: site.contact.latitude,
                  longitude: site.contact.longitude,
                  post_code: site.contact.post_code,
                  post_town: site.contact.post_town,
                  telephone: site.contact.telephone,
                  website: site.contact.website,
                },
              },
            },
          });
        })
      );
    })
    .then(async (sites) => {
      return await Promise.all(
        sites.map(async (site) => {
          const timetable_ids = siteTimetablesMap.get(site.site_id);
          if (timetable_ids === undefined) {
            throw new Error("Site not found in siteTimetablesMap");
          }
          return {
            site_id: site.site_id,
            timetables: await Promise.all(
              timetable_ids.map((timetable_id) =>
                getDataFromAPI(
                  `https://api.activeintime.com/v1/timetables/${timetable_id}.json?key=${key}`
                )
              )
            ).then((responses) =>
              responses.map((response) => timetableValidator.parse(response))
            ),
          };
        })
      );
    })
    .then(async (sites_and_timetables) => {
      // console.log(getDeepObject(sites_and_timetables));

      // deduplicate and flatten the timetable sessions
      const alreadyseen = new Set<number>();
      const timetable_sessions: Array<TimetableSession> = [];

      sites_and_timetables.forEach((site_and_timetable) => {
        site_and_timetable.timetables.forEach((timetable) => {
          timetable.timetable_sessions.forEach((timetable_session) => {
            if (!alreadyseen.has(timetable_session.id)) {
              alreadyseen.add(timetable_session.id);
              timetable_sessions.push(timetable_session);
            }
          });
        });
      });

      // insert the timetable sessions
      for (const session of timetable_sessions) {
        await prisma.timetableSession.create({
          data: {
            timetablesession_id: session.id,
            name: session.name,
            category: session.timetable_session_category.name,
            description: session.description,
          },
        });
      }
      // Insert the timetables - and link up to the sessions
      sites_and_timetables.forEach(async (site_and_timetable) => {
        const site_id = site_and_timetable.site_id;
        site_and_timetable.timetables.forEach(async (timetable) => {
          await prisma.timetable.create({
            data: {
              timetable_id: timetable.id,
              name: timetable.name,
              site: {
                connect: {
                  site_id: site_id,
                },
              },
              sessions: {
                connect: timetable.timetable_sessions.map((session) => ({
                  timetablesession_id: session.id,
                })),
              },
            },
          });
        });
      });
      return sites_and_timetables;
    })
    .then(async (sites_and_timetables) => {
      // Get the timetable sessions - and keep the site_id
      const site_and_timetable_sessions = await Promise.all(
        sites_and_timetables.map((site_and_timetable) =>
          Promise.all(
            site_and_timetable.timetables.map(async (timetable) => ({
              site: site_and_timetable.site_id,
              timetable_sessions: await Promise.all([
                getDataFromAPI(
                  `https://api.activeintime.com/v1/timetables/${timetable.id}/timetable_entries.json?numberOfDays=7&key=${key}`
                ),
                getDataFromAPI(
                  `https://api.activeintime.com/v1/timetables/${timetable.id}/timetable_entries.json?numberOfDays=7&fromDate=${seven_days_later}&key=${key}`
                ),
              ]).then((responses) =>
                responses.flatMap((response) =>
                  timetableEntryValidator.parse(response)
                )
              ),
            }))
          )
        )
      ).then((results) => results.flat());

      return site_and_timetable_sessions;
    })
    .then((site_and_timetable_sessions) => {
      // Insert the timetable sessions
      site_and_timetable_sessions.forEach((site_and_timetable_session) => {
        const site_id = site_and_timetable_session.site;

        Promise.all(
          site_and_timetable_session.timetable_sessions.map(async (entry) => {
            await prisma.timetableEntry.create({
              data: {
                date_time: new Date(entry.date + "T" + entry.start_time),
                end_time: new Date(entry.date + "T" + entry.end_time),
                facility_name: entry.facility_name,
                name: entry.timetable_session.name,
                instructor_name: entry.instructor?.display_name ?? "",
                level: entry.level
                  ? entry.level.name.match(/\&#x1F9E1/g)?.length ?? 2
                  : 2,
                is_cancelled: entry.is_cancelled,
                facility: {
                  connect: {
                    facility_id: `${entry.facility.id}_${site_id}`,
                  },
                },
                session: {
                  connect: {
                    timetablesession_id: entry.timetable_session.id,
                  },
                },
              },
            });
          })
        );
      });
    });
}

main();

export {};
