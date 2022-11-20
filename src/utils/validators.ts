import { z } from "zod";

const contactValidator = z.object({
  address_line_1: z.string(),
  address_line_2: z.string(),
  post_code: z.string(),
  post_town: z.string(),
  country: z.string().nullable(),
  telephone: z.string().nullable(),
  website: z.string().nullable(),
  latitude: z.string().nullable(),
  longitude: z.string().nullable(),
  twitter: z.string().nullable(),
  facebook: z.string().nullable(),
  swimmers_guide_id: z.string().nullable(),
});

const facilitiesValidator = z.object({
  tldc_approved: z.boolean(),
  id: z.number(),
  length: z.number().nullable(),
  primary_name: z.string(),
  facility_type: z.object({
    id: z.number(),
    name: z.string(),
  }),
  no_of_timetables: z.number(),
  facility_name_aliases: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      is_primary: z.boolean(),
    })
  ),
});

export const siteValidator = z.object({
  id: z.number(),
  name: z.string(),
  tldc_approved: z.boolean(),
  timezone: z.string().nullable(),
  foreign_key: z.string().nullable(),
  contact: contactValidator,
  name_translations: z.object({}),
  facilities: z.array(facilitiesValidator),
  timetables: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
    })
  ),
  management: z.object({
    id: z.number(),
    name: z.string(),
  }),
});

const timetableSessionValidator = z.object({
  description: z.string(),
  foreign_key: z.string().nullable(),
  id: z.number().int(),
  name: z.string(),
  timetable_session_category: z.object({
    id: z.number(),
    name: z.string(),
  }),
});

export const timetableValidator = z.object({
  id: z.number(),
  name: z.string(),
  instructors: z.array(
    z.object({
      first_name: z.string(),
      last_name: z.string(),
      display_name: z.string(),
    })
  ),
  timetable_sessions: z.array(timetableSessionValidator),
  facilities: z.array(facilitiesValidator),
  levels: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
    })
  ),
});

export const timetableEntryValidator = z.array(
  z.object({
    id: z.number(),
    start_time: z.string(),
    end_time: z.string(),
    facility_name: z.string(),
    date: z.string(),
    day: z.string(),
    term_type: z.object({ id: z.number().int(), name: z.string() }),
    is_cancelled: z.boolean(),
    timetable_session: z.object({
      id: z.number(),
      name: z.string(),
      foreign_key: z.string().nullable(),
    }),
    facility: z.object({
      id: z.number(),
      length: z.number().nullable(),
      primary_name: z.string(),
      facility_type: z.object({ id: z.number(), name: z.string() }),
    }),
    ttentry_foreign_key: z.string().nullable(),
    instructor: z.optional(
      z.object({
        first_name: z.string(),
        last_name: z.string(),
        display_name: z.string(),
      })
    ),
    level: z.optional(z.object({ id: z.number(), name: z.string() })),
  })
);

export type Site = z.infer<typeof siteValidator>;
export type Timetable = z.infer<typeof timetableValidator>;
export type TimetableEntry = z.infer<typeof timetableEntryValidator>;
export type TimetableSession = z.infer<typeof timetableSessionValidator>;
