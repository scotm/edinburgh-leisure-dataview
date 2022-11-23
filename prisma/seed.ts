import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { readFile, writeFile } from "fs/promises";
import { Md5 as md5 } from "ts-md5";
import { sites } from "../src/utils/constants";
import {
  siteValidator,
  Timetable,
  TimetableEntry,
  timetableEntryValidator,
  timetableValidator,
} from "../src/utils/validators";

import { stripHTML } from "../src/utils/functions";

const prisma = new PrismaClient();
const debug = true;

const key = process.env.ACTIVEINTIME_KEY;
const seven_days_later = new Date(Date.now() + 3600 * 1000 * 24 * 7)
  .toISOString()
  .split("T")[0];

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

async function writeJSON(filename: string, data: unknown) {
  try {
    return await writeFile(filename, JSON.stringify(data));
  } catch (e) {
    console.log(e);
  }
}

// A basic function to return the results of an API call, and cache it for later
async function getDataFromAPI(url: string) {
  const digest = md5.hashStr(url);
  const filename = `${__dirname}/data/${digest}.json`;
  let result = await readJSONFromFile(filename);

  if (result === undefined) {
    if (debug) console.log(url);
    result = await axios.get(url).then((response) => response.data.response);
    await writeJSON(filename, result);
  }
  return result;
}

async function main() {
  const confirmedSites = await Promise.all(
    sites.map((site) =>
      getDataFromAPI(
        `https://api.activeintime.com/v1/sites/${site.id}.json?key=${key}`
      )
    )
  ).then(async (responses) =>
    responses.map((response) => siteValidator.parse(response))
  );

  await Promise.all(
    confirmedSites.map((site) =>
      prisma.site.create({
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
      })
    )
  );

  const timetablesMap = new Map<number, Timetable>();
  for (const site of confirmedSites) {
    for (const timetable of site.timetables) {
      const url = `https://api.activeintime.com/v1/timetables/${timetable.id}.json?key=${key}`;
      const confirmedTimetable = await getDataFromAPI(url).then((data) =>
        timetableValidator.parse(data)
      );
      timetablesMap.set(timetable.id, confirmedTimetable);
    }
  }

  const timetablesessions = Array.from(timetablesMap.entries())
    .map(([id, timetable]) => ({
      timetable_id: id,
      sessions: timetable.timetable_sessions,
    }))
    .map(({ timetable_id, sessions }) => {
      return sessions.map((session) =>
        prisma.timetableSession.create({
          data: {
            timetablesession_id: `${timetable_id}_${session.id}`,
            name: session.name,
            category: session.timetable_session_category.name,
            description: session.description,
          },
        })
      );
    });
  await Promise.all(timetablesessions.flat());

  for (const site of confirmedSites) {
    for (const timetable of site.timetables) {
      const foundTimetable = timetablesMap.get(timetable.id);
      if (foundTimetable === undefined) {
        throw new Error("Timetable not found");
      }
      await prisma.timetable.create({
        data: {
          timetable_id: foundTimetable.id,
          name: foundTimetable.name,
          site: {
            connect: {
              site_id: site.id,
            },
          },
          sessions: {
            connect: foundTimetable.timetable_sessions.map((session) => ({
              timetablesession_id: `${foundTimetable.id}_${session.id}`,
            })),
          },
        },
      });
    }
  }

  const timetableEntriesMap = new Map<number, TimetableEntry>();

  for (const [timetable_id] of timetablesMap) {
    const confirmedTimetableEntries = await Promise.all([
      getDataFromAPI(
        `https://api.activeintime.com/v1/timetables/${timetable_id}/timetable_entries.json?numberOfDays=7&key=${key}`
      ),
      getDataFromAPI(
        `https://api.activeintime.com/v1/timetables/${timetable_id}/timetable_entries.json?numberOfDays=7&fromDate=${seven_days_later}&key=${key}`
      ),
    ]).then((responses) =>
      responses.flatMap((response) => timetableEntryValidator.parse(response))
    );
    timetableEntriesMap.set(timetable_id, confirmedTimetableEntries);
  }

  for (const [timetable_id, timetable_entries] of timetableEntriesMap) {
    await Promise.all(
      timetable_entries.map((entry) =>
        prisma.timetableEntry.create({
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
            session: {
              connect: {
                timetablesession_id: `${timetable_id}_${entry.timetable_session.id}`,
              },
            },
          },
        })
      )
    );
  }

  const data = await prisma.timetableEntry.findMany({
    include: {
      session: {
        include: {
          Timetable: {
            include: {
              site: true,
            },
          },
        },
      },
    },
    orderBy: {
      date_time: "asc",
    },
    where: {
      is_cancelled: false,
      date_time: {
        gte: new Date(),
      },
      NOT: {
        OR: [
          {
            name: {
              contains: "Swimming",
            },
          },
          {
            name: {
              contains: "Closed",
            },
          },
        ],
      },
    },
  });
  const newdata = data
    .filter(
      (item) =>
        item.end_time.getTime() - item.date_time.getTime() <= 3600 * 1000 && // 1 hour
        !item.name.includes("Closed") &&
        !item.name.includes("Swimming")
    )
    .map((item) => {
      return {
        name: item.name,
        description: stripHTML(
          item.session.description.replaceAll("&nbsp;", " ")
        ),
        date: item.date_time,
        end_time: item.end_time,
        site: {
          name: item.session.Timetable?.site.name,
          facility: item.facility_name,
        },
        level: item.level,
      };
    });
  await Promise.all(
    newdata.map((item) =>
      prisma.allEvents.create({
        data: {
          name: item.name,
          description: item.description,
          date: item.date,
          end_time: item.end_time,
          level: item.level,
          site_facility: item.site.facility,
          site_name: item.site.name ?? "",
        },
      })
    )
  );

  // const timetables = confirmedSites.map((site) => {
  //   site: site.id;
  //   timetables: await Promise.all()

  //     return getDataFromAPI(url).then((response) =>
  //       timetableValidator.parse(response)
  //     );
  //   })
  // );

  //   confirmedSites.forEach((site) => {
  //     siteTimetablesMap.set(
  //       site.id,
  //       site.timetables.map((t) => t.id)
  //     );
  //   });
  //   for (const site of confirmedSites) {
  //     await prisma.site.create({
  //       data: {
  //         site_id: site.id,
  //         name: site.name,
  //         timezone: site.timezone ?? "Europe/London",
  //         tldc_approved: site.tldc_approved,
  //         facilities: {
  //           create: site.facilities.map((facility) => ({
  //             name: facility.primary_name,
  //             length: facility.length,
  //             facility_id: `${facility.id}_${site.id}`,
  //             tldc_approved: facility.tldc_approved,
  //           })),
  //         },
  //         contact: {
  //           create: {
  //             address_line_1: site.contact.address_line_1,
  //             address_line_2: site.contact.address_line_2,
  //             country: site.contact.country,
  //             latitude: site.contact.latitude,
  //             longitude: site.contact.longitude,
  //             post_code: site.contact.post_code,
  //             post_town: site.contact.post_town,
  //             telephone: site.contact.telephone,
  //             website: site.contact.website,
  //           },
  //         },
  //       },
  //     });
  //   }
  //   return confirmedSites;

  // .then(async (sites) =>
  //   Promise.all(
  //     sites.map(async (site) => {
  //       return {
  //         site: site,
  //         timetables: await Promise.all(
  //           site.timetables.map((timetable) =>
  //             getDataFromAPI(
  //               `https://api.activeintime.com/v1/timetables/${timetable.id}.json?key=${key}`
  //             )
  //           )
  //         ).then((responses) =>
  //           responses.map((response) => timetableValidator.parse(response))
  //         ),
  //       };
  //     })
  //   )
  // )
  // .then(async (sites_and_timetables) => {
  //   const d = sites_and_timetables.map((s_t) =>
  //     s_t.site.timetables.map((t) => t.id)
  //   );
  //   if (d.flat().length !== new Set(d.flat()).size) {
  //     console.log("Duplicates found in timetables");
  //   }

  //   // deduplicate and flatten the timetable sessions
  //   const alreadyseen = new Set<string>();

  //   sites_and_timetables.forEach((site_and_timetable) => {
  //     const site = site_and_timetable.site;
  //     site_and_timetable.timetables.forEach((timetable) => {
  //       Promise.all(
  //         timetable.timetable_sessions.map((timetable_session) => {
  //           return prisma.timetableSession.create({
  //             data: {
  //               timetablesession_id: `${site.id}_${timetable_session.id}`,
  //               name: timetable_session.name,
  //               category: timetable_session.timetable_session_category.name,
  //               description: timetable_session.description,
  //             },
  //           });
  //         })
  //       ).catch((e) => {
  //         console.log(e);
  //       });
  //     });
  //   });

  //   // insert the timetable sessions
  //   // for (const session of timetable_sessions) {
  //   //   await ;
  //   // }
  //   // Insert the timetables - and link up to the sessions
  //   sites_and_timetables.forEach(async (site_and_timetable) => {
  //     const site = site_and_timetable.site;
  //     site_and_timetable.timetables.forEach(async (timetable) => {
  //       await prisma.timetable.create({
  //         data: {
  //           timetable_id: timetable.id,
  //           name: timetable.name,
  //           site: {
  //             connect: {
  //               site_id: site.id,
  //             },
  //           },
  //           sessions: {
  //             connect: timetable.timetable_sessions.map((session) => ({
  //               timetablesession_id: `${site.id}_${session.id}`,
  //             })),
  //           },
  //         },
  //       });
  //     });
  //   });

  //   // Get the timetable sessions - and keep the site_id
  //   const site_and_timetable_sessions = await Promise.all(
  //     sites_and_timetables.map((site_and_timetable) =>
  //       Promise.all(
  //         site_and_timetable.timetables.map(async (timetable) => ({
  //           site: site_and_timetable.site,
  //           timetable_sessions: await Promise.all([
  //             getDataFromAPI(
  //               `https://api.activeintime.com/v1/timetables/${timetable.id}/timetable_entries.json?numberOfDays=7&key=${key}`
  //             ),
  //             getDataFromAPI(
  //               `https://api.activeintime.com/v1/timetables/${timetable.id}/timetable_entries.json?numberOfDays=7&fromDate=${seven_days_later}&key=${key}`
  //             ),
  //           ]).then((responses) =>
  //             responses.flatMap((response) =>
  //               timetableEntryValidator.parse(response)
  //             )
  //           ),
  //         }))
  //       )
  //     )
  //   ).then((results) => results.flat());

  //   return site_and_timetable_sessions;
  // })
  // .then((site_and_timetable_sessions) => {
  //   // Insert the timetable sessions
  //   site_and_timetable_sessions.forEach((site_and_timetable_session) => {
  //     const site = site_and_timetable_session.site;

  //     Promise.all(
  //       site_and_timetable_session.timetable_sessions.map(async (entry) => {
  //         await prisma.timetableEntry.create({
  //           data: {
  //             date_time: new Date(entry.date + "T" + entry.start_time),
  //             end_time: new Date(entry.date + "T" + entry.end_time),
  //             facility_name: entry.facility_name,
  //             name: entry.timetable_session.name,
  //             instructor_name: entry.instructor?.display_name ?? "",
  //             level: entry.level
  //               ? entry.level.name.match(/\&#x1F9E1/g)?.length ?? 2
  //               : 2,
  //             is_cancelled: entry.is_cancelled,
  //             facility: {
  //               connect: {
  //                 facility_id: `${entry.facility.id}_${site.id}`,
  //               },
  //             },
  //             session: {
  //               connect: {
  //                 timetablesession_id: `${site.id}_${entry.timetable_session.id}`,
  //               },
  //             },
  //           },
  //         });
  //       })
  //     );
  //   });
  // });
}

main();

export {};
