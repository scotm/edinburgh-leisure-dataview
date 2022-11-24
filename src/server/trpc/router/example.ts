import { router, publicProcedure } from "../trpc";
import { sites } from "../../../utils/constants";
import { stripHTML } from "../../../utils/functions";

export const exampleRouter = router({
  basicsites: publicProcedure.query(() => {
    return sites;
  }),
  simplerTimes: publicProcedure.query(async ({ ctx }) =>
    ctx.prisma.allEvents
      .findMany({
        orderBy: { date: "asc" },
        where: {
          date: {
            gte: new Date(),
          },
        },
      })
      .then((data) =>
        data.map((item) => {
          return {
            event_name: item.name,
            description: item.description,
            date: item.date.toLocaleDateString(),
            time: item.date.toLocaleTimeString(),
            end_time: item.end_time.toLocaleTimeString(),
            site_name: item.site_name,
            site_facility: item.site_facility,
            level: item.level,
            instructor: item.instructor,
          };
        })
      )
  ),
  alltimes: publicProcedure.query(async ({ ctx }) => {
    const data = await ctx.prisma.timetableEntry.findMany({
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
          lte: new Date(new Date().setDate(new Date().getDate() + 7)),
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
        (entry) =>
          entry.end_time.getTime() - entry.date_time.getTime() <= 3600 * 1000 // 1 hour
      )
      .map((entry) => {
        return {
          name: entry.name,
          description: stripHTML(
            entry.session.description.replaceAll("&nbsp;", " ")
          ),
          date: entry.date_time.toLocaleDateString(),
          time: entry.date_time.toLocaleTimeString(),
          end_time: entry.end_time.toLocaleTimeString(),
          site: {
            name: entry.session.Timetable?.site.name,
            facility: entry.facility_name,
          },
          level: entry.level,
          instructor: entry.instructor_name,
        };
      });

    return newdata;
  }),
});
