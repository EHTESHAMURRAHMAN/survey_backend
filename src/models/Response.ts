import { Schema, model, Types, InferSchemaType } from "mongoose";

const ChoiceSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, ref: "Question", required: true },
    optionIds: [{ type: Schema.Types.ObjectId, ref: "Option", required: true }],
  },
  { _id: false }
);

const ResponseSchema = new Schema(
  {
    surveyId: { type: Schema.Types.ObjectId, ref: "Survey", required: true },

    // 🆕 NEW FIELDS
    name: { type: String, default: "Anonymous" },
    company: { type: String, index: true }, // indexing for fast filtering

    choices: { type: [ChoiceSchema], default: [] },
  },
  { timestamps: true }
);


ResponseSchema.virtual("id").get(function (this: { _id: Types.ObjectId }) {
  return this._id.toHexString();
});


ResponseSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    delete (ret as any)._id;
    return ret;
  },
});


type Response = InferSchemaType<typeof ResponseSchema> & { id: string };
export default model<Response>("Response", ResponseSchema);
