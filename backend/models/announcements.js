const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['draft', 'published', 'deactivated'],
        default: 'draft'
    },
    priority: {
        type: String,
        enum: ['low', 'normal', 'high', 'urgent'],
        default: 'normal'
    },
    targetAudience: {
        type: [String],
        enum: ['student', 'teacher', 'all'],
        default: ['all']
    }
}, {
    timestamps: true  // This adds createdAt and updatedAt automatically
});

module.exports = mongoose.model('Announcement', announcementSchema);
