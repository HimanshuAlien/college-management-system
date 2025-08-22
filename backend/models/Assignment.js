const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    subject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject',
        required: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    dueDate: {
        type: Date,
        required: true
    },
    maxMarks: {
        type: Number,
        required: true,
        min: 1
    },
    attachments: [String],
    instructions: String,
    isActive: {
        type: Boolean,
        default: true
    },
    // Submissions embedded for better performance
    submissions: [{
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        submittedAt: {
            type: Date,
            default: Date.now
        },
        files: [String],
        content: String,
        grade: {
            marks: { type: Number, min: 0 },
            feedback: String,
            gradedAt: Date,
            gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        },
        isLate: {
            type: Boolean,
            default: false
        }
    }]
}, {
    timestamps: true
});

// Index for efficient queries
assignmentSchema.index({ subject: 1, dueDate: 1 });
assignmentSchema.index({ 'submissions.student': 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);
