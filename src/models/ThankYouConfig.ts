import mongoose, { Schema } from "mongoose";

const ThankYouConfigSchema = new Schema(
  {
    page: {
      type: String,
      required: true,
      unique: true
    },
    image: {
      type: String,
      required: true
    },
    heading: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("ThankYouConfig", ThankYouConfigSchema);
