import mongoose from 'mongoose';

const { Schema } = mongoose;

const schema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    runId: { type: Schema.Types.ObjectId, ref: 'TestRun', required: true },
    caseId: { type: Schema.Types.ObjectId, ref: 'TestCase', required: true },
    status: { type: String, enum: ['passed', 'failed', 'blocked', 'skipped'] },
    notes: String,
    durationSec: Number,
    bugItemId: { type: Schema.Types.ObjectId, ref: 'Issue', default: null },
    testedBy: Schema.Types.Mixed,
    testedByName: Schema.Types.Mixed,
    testedAt: Date
  },
  { versionKey: false }
);

schema.index({ runId: 1, caseId: 1 }, { unique: true });
schema.index({ projectId: 1, status: 1, testedAt: -1 });

export default mongoose.model('TestResult', schema, 'testResults');
