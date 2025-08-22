const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },

    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },

    credits: {
        type: Number,
        required: true,
        min: 1,
        max: 6
    },

    // ✅ Each subject belongs to a teacher
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    classTeacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,  // ✅ Optional
        default: null     // ✅ Default to null
    },

    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },

    description: String,
    syllabus: String,
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Subject', subjectSchema);
