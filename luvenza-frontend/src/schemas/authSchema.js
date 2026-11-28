import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(6, "Password must contain at least 6 characters.")
});

export const measurementSchema = z.object({
  profileName: z.string().trim().min(2, "Give this measurement profile a name."),
  height: z.coerce.number().positive(),
  bust: z.coerce.number().positive(),
  waist: z.coerce.number().positive(),
  hip: z.coerce.number().positive(),
  shoulder: z.coerce.number().positive(),
  sleeveLength: z.coerce.number().positive(),
  dressLength: z.coerce.number().positive(),
  unit: z.enum(["cm", "inches"])
});
