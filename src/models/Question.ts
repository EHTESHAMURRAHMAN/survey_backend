
import { Schema, model, Types } from "mongoose";

const QuestionSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    surveyId:   { type: Schema.Types.ObjectId, ref: "Survey", required: true },
    segment: { type: String },
    segmentTitle: { type: String, trim:true },
    text: { type: String, required: true },      
    details: { type: String },
    type: { type: String, enum: ["radio", "checkbox", "text"], required: true },
    image: String,
  },
  { timestamps: true }
);

// virtual id
QuestionSchema.virtual("id").get(function (this: { _id: Types.ObjectId }) {
  return this._id.toHexString();
});

QuestionSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete (ret as any)._id;
    return ret;
  },
});

export default model("Question", QuestionSchema);
