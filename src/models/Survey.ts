import { Schema, model } from "mongoose";

const SurveySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String, required: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    totalCount: { type: Number, default: 0 },
    publicToken: { type: String, index: true }, 
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } }
);

export default model("Survey", SurveySchema);
