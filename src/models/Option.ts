
import mongoose, { Schema, InferSchemaType, models, model } from "mongoose";

const OptionSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: "Question", required: true },
    text: { type: String, required: true, trim: true },
    
    risk: {
      type: String,
      enum: ["Red", "Yellow", "Green"],
      default: "Green",
      set: (v: unknown) => {
        const s = String(v ?? "").toLowerCase();
        if (s === "red") return "Red";
        if (s === "yellow" || s === "amber") return "Yellow";
        if (s === "green") return "Green";
        return "Green";
      },
    },
  },
  { timestamps: true }
);

// Avoid model recompilation in dev
export type OptionDoc = InferSchemaType<typeof OptionSchema>;
export default (models.Option as mongoose.Model<OptionDoc>) ||
  model<OptionDoc>("Option", OptionSchema);





