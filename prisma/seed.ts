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

const prisma = new PrismaClient();
const debug = true;
const sites = minimalsites;

const key = "D8lafTKUXBelUzs2s33bTGU3j7MBfOEtNKn1bAoX";

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
function getInverse(lookupMap: Map<number, Array<number>>) {
  const inverse = new Map<number, number>();
  lookupMap.forEach((value, key) => {
    value.forEach((v) => {
      inverse.set(v, key);
    });
  });
  return inverse;
}

// Keeping these in file scope. They are used in multiple functions
const siteTimetablesMap = new Map<number, Array<number>>();
const facilities_seen = new Set<number>();

async function main() {
  await Promise.all(
    sites.map((site) =>
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

      // Create the SiteFacility objects
      const facilities = confirmedSites
        .flatMap((site) => site.facilities)
        .filter((facility) => {
          if (facilities_seen.has(facility.id)) {
            return false;
          } else {
            facilities_seen.add(facility.id);
            return true;
          }
        });

      await Promise.all(
        facilities.map(async (facility) => {
          await prisma.siteFacility.create({
            data: {
              name: facility.primary_name,
              length: facility.length,
              facility_id: facility.id,
              tldc_approved: facility.tldc_approved,
            },
          });
        })
      );

      await Promise.all(
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
                connect: site.facilities.map((facility) => ({
                  facility_id: facility.id,
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
    .then(async () => {
      // Get a really big list of all the timetable ids
      const timetable_ids = Array.from(siteTimetablesMap.values()).flat();

      await Promise.all(
        timetable_ids.map((timetable) =>
          getDataFromAPI(
            `https://api.activeintime.com/v1/timetables/${timetable}.json?key=${key}`
          )
        )
      ).then(async (timetables) => {
        const alreadyseen = new Set<number>();
        const verified_timetables = timetables.map((timetable) =>
          timetableValidator.parse(timetable)
        );
        const timetable_sessions: Array<TimetableSession> = [];
        verified_timetables.forEach((timetable) => {
          timetable.timetable_sessions.forEach((session) => {
            if (!alreadyseen.has(session.id)) {
              alreadyseen.add(session.id);
              timetable_sessions.push(session);
            }
          });
        });

        // Add the timetable sessions to the database
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

        const timetable_data = verified_timetables.map((timetable) => {
          const site_id = getInverse(siteTimetablesMap).get(timetable.id);
          return {
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
          };
        });
        timetable_data.forEach(async (d) => {
          await prisma.timetable.create({
            data: d,
          });
        });
      });
      await Promise.all(
        timetable_ids
          .map((timetable) => {
            const seven_days_later = new Date(Date.now() + 3600 * 1000 * 24 * 7)
              .toISOString()
              .split("T")[0];
            return [
              getDataFromAPI(
                `https://api.activeintime.com/v1/timetables/${timetable}/timetable_entries.json?numberOfDays=7&key=${key}`
              ),
              getDataFromAPI(
                `https://api.activeintime.com/v1/timetables/${timetable}/timetable_entries.json?numberOfDays=7&fromDate=${seven_days_later}&key=${key}`
              ),
            ];
          })
          .flat()
      ).then((timetable_entries) => {
        const verified_entries = timetable_entries
          .map((entry) => timetableEntryValidator.parse(entry))
          .flat();

        verified_entries.forEach(async (entry) => {
          await prisma.timetableEntry.create({
            data: {
              date_time: new Date(entry.date + "T" + entry.start_time),
              facility_name: entry.facility_name,
              name: entry.timetable_session.name,
              instructor_name: entry.instructor?.display_name ?? "",
              level: entry.level
                ? entry.level.name.match("&#x1F9E1")?.length ?? 2
                : 2,
              is_cancelled: entry.is_cancelled,
              facility: {
                connect: {
                  facility_id: entry.facility.id,
                },
              },
              session: {
                connect: {
                  timetablesession_id: entry.timetable_session.id,
                },
              },
            },
          });
        });
      });
    });
}

main();

export {};
