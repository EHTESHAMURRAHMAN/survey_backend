import { Schema, model, Document } from "mongoose";

export interface UIConfigDocument extends Document {
  page: string;
  config: Record<string, any>;
}

const UIConfigSchema = new Schema<UIConfigDocument>(
  {
    page: {
      type: String,
      required: true,
      unique: true
    },
    config: {
      type: Object,
      required: true
    }
  },
  { timestamps: true }
);

export default model<UIConfigDocument>("UIConfig", UIConfigSchema);
