import { PrismaClient } from "@prisma/client";
import { readFile, unlink, writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { Md5 as md5 } from "ts-md5";
import { sites } from "../src/utils/constants";
import {
  siteValidator,
  Timetable,
  TimetableEntry,
  timetableEntryValidator,
  timetableValidator,
} from "../src/utils/validators";

import { TimetableEntry as PrismaTimetableEntry } from "@prisma/client";

import { stripHTML } from "../src/utils/functions";

const prisma = new PrismaClient();
const debug = true;

const key = process.env.ACTIVEINTIME_KEY;
const dates = [
  new Date(),
  new Date(Date.now() + 3600 * 1000 * 24 * 7),
  // new Date(Date.now() + 3600 * 1000 * 24 * 14),
].map((d) => d.toISOString().split("T")[0]);

// https://stackoverflow.com/questions/10011011/reading-a-local-json-file-in-node-js
async function readJSONFromFile(filename: string) {
  try {
    const result = JSON.parse(await readFile(filename, "utf-8"));
    return result;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e.code !== undefined && e.code !== "ENOENT") {
      await unlink(filename).catch((e) => {
        console.log(e);
      });
    }
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
  const dir = `${__dirname}/data`;
  if (!existsSync(dir)) {
    mkdirSync(dir);
  }
  const filename = `${dir}/${digest}.json`;
  let result = await readJSONFromFile(filename);

  if (result === undefined) {
    if (debug) console.log(`Fetching and caching ${url}`);
    result = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:107.0) Gecko/20100101 Firefox/107.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
    }).then((res) => res.json());
    result = result.response;
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
    await Promise.all(
      site.timetables.map(async (timetable) => {
        const url = `https://api.activeintime.com/v1/timetables/${timetable.id}.json?key=${key}`;
        const confirmedTimetable = await getDataFromAPI(url)
          .then((data) => timetableValidator.parse(data))
          .catch((reason) => {
            console.log(`failed url: ${url}`);
            throw reason;
          });
        timetablesMap.set(timetable.id, confirmedTimetable);
      })
    );
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
    const confirmedTimetableEntries = await Promise.all(
      dates.map((date) =>
        getDataFromAPI(
          `https://api.activeintime.com/v1/timetables/${timetable_id}/timetable_entries.json?numberOfDays=7&fromDate=${date}&key=${key}`
        )
      )
    ).then((responses) =>
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
        item.end_time.getTime() - item.date_time.getTime() <= 1000 * 3600 && // 1 hour
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
        instructor: item.instructor_name,
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
          instructor: item.instructor,
        },
      })
    )
  );
}

main();

export {};
