import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Company from './models/Company';
import Survey from './models/Survey';
import Question from './models/Question';
import Option from './models/Option';

dotenv.config();

async function run() {
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/launchalot';
  await mongoose.connect(MONGO_URI);

  await Promise.all([Company.deleteMany({}), Survey.deleteMany({}), Question.deleteMany({}), Option.deleteMany({})]);

  const c1 = await Company.create({ name: 'new' });
  const c2 = await Company.create({ name: 'Internet Explorer Team' });
  const c3 = await Company.create({ name: 'Dexbit' });

  const s1 = await Survey.create({ companyId: c1._id, name: 'aeda', status: 'ACTIVE', totalCount: 1 });
  const s2 = await Survey.create({ companyId: c2._id, name: 'Internet Explorer Test', status: 'ACTIVE', totalCount: 9 });

  const q1 = await Question.create({
    companyId: c2._id,
    surveyId: s2._id,
    segment: 'Segment: 1',
    segmentTitle: 'Test 1',
    text: 'How often do you use Internet Explorer?',
    details: 'We want to understand how frequently Internet Explorer is used compared to other browsers.',
    type: 'radio'
  });

  await Option.create({ questionId: q1._id, text: 'Daily', risk: 'Green' });
  await Option.create({ questionId: q1._id, text: 'Weekly', risk: 'Amber' });
  await Option.create({ questionId: q1._id, text: 'Rarely', risk: 'Red' });

  console.log('Seeded sample data');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
