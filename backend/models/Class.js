const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    branch: {
        type: String,
        required: true,
        trim: true
    },
    year: {
        type: Number,
        required: true,
        min: 1,
        max: 4
    },
    section: {
        type: String,
        default: 'A'
    },
    subjects: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject'
    }],
    classTeacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,  // ✅ Make it optional
        default: null     // ✅ Default to null
    },
    totalStudents: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Create unique index for class identification
classSchema.index({ branch: 1, year: 1, section: 1 }, { unique: true });

module.exports = mongoose.model('Class', classSchema);
