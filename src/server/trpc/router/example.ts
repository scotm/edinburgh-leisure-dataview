import { router, publicProcedure } from "../trpc";
import { z } from "zod";
import { sites } from "../../../utils/constants";

// Strip out HTML from a string
function stripHTML(html: string) {
  return html.replace(/(<([^>]+)>)/gi, "");
}

export const exampleRouter = router({
  hello: publicProcedure
    .input(z.object({ text: z.string().nullish() }).nullish())
    .query(({ input }) => {
      return {
        greeting: `Hello ${input?.text ?? "world"}`,
      };
    }),
  getAll: publicProcedure.query(({ ctx }) => {
    return ctx.prisma.example.findMany();
  }),
  basicsites: publicProcedure.query(() => {
    return sites;
  }),
  alltimes: publicProcedure.query(async ({ ctx }) => {
    const data = await ctx.prisma.timetableEntry.findMany({
      include: {
        facility: true,
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
      },
    });
    const newdata = data.map((item) => {
      return {
        name: item.name,
        description: stripHTML(
          item.session.description.replaceAll("&nbsp;", " ")
        ),
        date: item.date_time.toLocaleDateString(),
        time: item.date_time.toLocaleTimeString(),
        end_time: item.end_time.toLocaleTimeString(),
        instructor: item.instructor_name,
        site: {
          name: item.session.Timetable?.site.name,
          facility_name: item.facility.name,
        },
        level: item.level,
      };
    });

    return newdata;
  }),
});
