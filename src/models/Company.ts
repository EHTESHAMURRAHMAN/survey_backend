import mongoose, { Schema, Types } from "mongoose";

const CompanySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    
    logoUrl: { type: String },
    
    logoUrls: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Company", CompanySchema);
