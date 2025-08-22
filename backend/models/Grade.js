const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true },
    subjectCode: { type: String, required: true },
    credits: { type: Number, required: true },
    percentage: { type: Number, required: true },
    gradePoint: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Grade', gradeSchema);
