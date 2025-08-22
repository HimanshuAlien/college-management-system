const express = require('express');
const mongoose = require('mongoose'); // ← ADD THIS
const multer = require('multer');
const path = require('path');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');
const Message = require('../models/Message');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// Multer setup for assignments
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'backend/uploads/assignments/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
// ✅ ADD this profile upload config (keep your existing upload for assignments)
const profileUpload = multer({
    dest: 'backend/uploads/profiles/',
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files allowed!'), false);
        }
    }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Apply auth middleware to all routes
router.use(auth);
router.use(authorize(['student']));

// Student dashboard route
router.get('/dashboard', async (req, res) => {
    try {
        const studentId = req.user.id;

        // Get student with basic class info
        const student = await User.findById(studentId)
            .populate('classId', 'name branch year section');

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Get subjects for the student's class (separate query)
        let subjects = [];
        if (student.classId) {
            subjects = await Subject.find({ class: student.classId._id })
                .populate('teacher', 'name email')
                .select('name code credits');
        }

        // Get attendance data
        const attendanceBySubject = await Attendance.aggregate([
            { $match: { student: new mongoose.Types.ObjectId(studentId) } },
            {
                $group: {
                    _id: '$subject',
                    totalClasses: { $sum: 1 },
                    presentClasses: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }
                }
            },
            {
                $addFields: {
                    percentage: {
                        $round: [{ $multiply: [{ $divide: ['$presentClasses', '$totalClasses'] }, 100] }, 2]
                    }
                }
            }
        ]);

        // Calculate overall attendance
        const totalClasses = attendanceBySubject.reduce((sum, item) => sum + item.totalClasses, 0);
        const totalPresent = attendanceBySubject.reduce((sum, item) => sum + item.presentClasses, 0);
        const overallAttendance = totalClasses > 0 ? Math.round((totalPresent / totalClasses) * 100) : 0;

        // Get recent assignments
        const recentAssignments = await Assignment.find({
            subject: { $in: subjects.map(s => s._id) },
            dueDate: { $gte: new Date() }
        })
            .populate('subject', 'name code')
            .sort({ dueDate: 1 })
            .limit(5);

        res.json({
            student: student.toJSON(),
            subjects,
            overallAttendance,
            attendanceBySubject,
            recentAssignments,
            pendingAssignments: recentAssignments.length
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ message: error.message });
    }
});
const Grade = require('../models/Grade'); // Add this import at top

// Add grade route
router.post('/grades', async (req, res) => {
    try {
        const { subject, subjectCode, credits, percentage } = req.body;

        // Convert percentage to grade point
        let gradePoint = 0;
        if (percentage >= 90) gradePoint = 10;
        else if (percentage >= 80) gradePoint = 9;
        else if (percentage >= 70) gradePoint = 8;
        else if (percentage >= 60) gradePoint = 7;
        else if (percentage >= 50) gradePoint = 6;
        else if (percentage >= 40) gradePoint = 5;
        else gradePoint = 0;

        // Check if grade exists
        let grade = await Grade.findOne({
            student: req.user.id,
            subject: subject
        });

        if (grade) {
            // Update existing
            grade.percentage = percentage;
            grade.gradePoint = gradePoint;
            grade.credits = credits;
            grade.subjectCode = subjectCode;
            await grade.save();
        } else {
            // Create new
            grade = new Grade({
                student: req.user.id,
                subject,
                subjectCode,
                credits,
                percentage,
                gradePoint
            });
            await grade.save();
        }

        // Calculate CGPA
        const allGrades = await Grade.find({ student: req.user.id });
        let totalCredits = 0;
        let totalPoints = 0;

        allGrades.forEach(g => {
            totalCredits += g.credits;
            totalPoints += g.gradePoint * g.credits;
        });

        const cgpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : 0;

        res.json({
            success: true,
            grade,
            cgpa: parseFloat(cgpa),
            message: 'Grade saved successfully!'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get grades route
router.get('/grades', async (req, res) => {
    try {
        const grades = await Grade.find({ student: req.user.id });

        let totalCredits = 0;
        let totalPoints = 0;

        grades.forEach(grade => {
            totalCredits += grade.credits;
            totalPoints += grade.gradePoint * grade.credits;
        });

        const cgpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : 0;

        const gradesBySubject = grades.map(grade => ({
            subject: { name: grade.subject, code: grade.subjectCode },
            credits: grade.credits,
            percentage: grade.percentage,
            gradePoint: grade.gradePoint
        }));

        res.json({
            success: true,
            gradesBySubject,
            cgpa: parseFloat(cgpa),
            totalCredits
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ✅ POST route to upload profile picture
router.post('/profile/picture', profileUpload.single('profilePic'), async (req, res) => {
    try {
        const userId = req.user.id;
        const profileImage = `/uploads/profiles/${req.file.filename}`;

        // Update user's profile image in database
        await User.findByIdAndUpdate(userId, { profileImage });

        res.json({
            success: true,
            profileImage,
            message: 'Profile picture updated successfully'
        });
    } catch (error) {
        console.error('Profile upload error:', error);
        res.status(500).json({ message: error.message });
    }
});

// ✅ GET route to fetch current user profile
router.get('/profile', async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ user });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: error.message });
    }
});

// ✅ PUT route to update user profile info
router.put('/profile', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, email, phone } = req.body;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { name, email, phone },
            { new: true }
        ).select('-password');

        res.json({
            success: true,
            user: updatedUser,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: error.message });
    }
});
// ✅ Add proper ObjectId handling
const { ObjectId } = require('mongoose').Types;



// Universal search route - ADD TO ALL 3 FILES
router.get('/search-users', async (req, res) => {
    try {
        const { query } = req.query;
        console.log('🔍 Search query received:', query); // Debug line

        if (!query || query.length < 2) {
            return res.json({ users: [] });
        }

        const users = await User.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { email: { $regex: query, $options: 'i' } }
            ],
            role: { $in: ['student', 'teacher', 'admin'] }
        })
            .select('name email role')
            .limit(10);

        console.log('👥 Found users:', users.length); // Debug line
        res.json({ users });
    } catch (error) {
        console.error('❌ Search error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Get attendance
router.get('/attendance', async (req, res) => {
    try {
        const studentId = req.user._id;

        const student = await User.findById(studentId).populate({
            path: 'classId',
            populate: { path: 'subjects', populate: { path: 'teacher', select: 'name' } }
        });

        const subjects = student.classId?.subjects || [];
        const subjectIds = subjects.map(s => s._id);

        const attendanceData = await Attendance.find({
            student: studentId,
            subject: { $in: subjectIds }
        }).populate('subject', 'name code').sort({ date: -1 });

        // Group by subject
        const attendanceBySubject = subjects.map(subject => {
            const subjectAttendance = attendanceData.filter(
                att => att.subject._id.toString() === subject._id.toString()
            );

            const totalClasses = subjectAttendance.length;
            const presentClasses = subjectAttendance.filter(att => att.status === 'present').length;
            const percentage = totalClasses > 0 ? Math.round((presentClasses / totalClasses) * 100) : 0;

            return {
                subject: subject,
                totalClasses,
                presentClasses,
                percentage,
                records: subjectAttendance.slice(0, 10) // Recent 10 records
            };
        });

        res.json({ attendanceBySubject });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get assignments
router.get('/assignments', async (req, res) => {
    try {
        const studentId = req.user._id;

        const student = await User.findById(studentId).populate('classId');
        const classId = student.classId._id;

        const assignments = await Assignment.find({
            subject: { $in: await Subject.find({ class: classId }).distinct('_id') }
        }).populate('subject', 'name code')
            .populate('teacher', 'name')
            .sort({ createdAt: -1 });

        const assignmentsWithStatus = assignments.map(assignment => {
            const submission = assignment.submissions.find(
                sub => sub.student.toString() === studentId.toString()
            );

            return {
                _id: assignment._id,
                title: assignment.title,
                description: assignment.description,
                subject: assignment.subject,
                teacher: assignment.teacher,
                dueDate: assignment.dueDate,
                maxMarks: assignment.maxMarks,
                attachments: assignment.attachments,
                instructions: assignment.instructions,
                submission: submission || null,
                status: submission ?
                    (submission.grade ? 'graded' : 'submitted') :
                    (new Date() > assignment.dueDate ? 'overdue' : 'pending')
            };
        });

        res.json({ assignments: assignmentsWithStatus });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Submit assignment
router.post('/assignments/:id/submit', upload.array('files', 5), async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const studentId = req.user._id;
        const { content } = req.body;

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        // Check if already submitted
        const existingSubmission = assignment.submissions.find(
            sub => sub.student.toString() === studentId.toString()
        );

        if (existingSubmission) {
            return res.status(400).json({ message: 'Assignment already submitted' });
        }

        const files = req.files ? req.files.map(file => `/uploads/assignments/${file.filename}`) : [];
        const isLate = new Date() > assignment.dueDate;

        assignment.submissions.push({
            student: studentId,
            files,
            content,
            isLate
        });

        await assignment.save();

        res.json({ message: 'Assignment submitted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// CGPA Calculator
router.get('/grades', async (req, res) => {
    try {
        const studentId = req.user._id;

        const student = await User.findById(studentId).populate({
            path: 'classId',
            populate: { path: 'subjects' }
        });

        const subjects = student.classId?.subjects || [];
        const subjectIds = subjects.map(s => s._id);

        // Get graded assignments
        const assignments = await Assignment.find({
            subject: { $in: subjectIds },
            'submissions.student': studentId,
            'submissions.grade.marks': { $exists: true }
        }).populate('subject', 'name credits');

        const gradesBySubject = subjects.map(subject => {
            const subjectAssignments = assignments.filter(
                assign => assign.subject._id.toString() === subject._id.toString()
            );

            let totalMarks = 0;
            let obtainedMarks = 0;

            subjectAssignments.forEach(assignment => {
                const submission = assignment.submissions.find(
                    sub => sub.student.toString() === studentId.toString()
                );
                if (submission && submission.grade) {
                    totalMarks += assignment.maxMarks;
                    obtainedMarks += submission.grade.marks;
                }
            });

            const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
            const gradePoint = calculateGradePoint(percentage);

            return {
                subject,
                assignments: subjectAssignments.length,
                percentage: Math.round(percentage * 100) / 100,
                gradePoint,
                credits: subject.credits
            };
        });

        // Calculate CGPA
        let totalCredits = 0;
        let weightedGradePoints = 0;

        gradesBySubject.forEach(grade => {
            if (grade.gradePoint > 0) {
                totalCredits += grade.credits;
                weightedGradePoints += grade.gradePoint * grade.credits;
            }
        });

        const cgpa = totalCredits > 0 ? (weightedGradePoints / totalCredits).toFixed(2) : 0;

        res.json({
            gradesBySubject,
            cgpa: parseFloat(cgpa),
            totalCredits
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Messages
router.get('/messages', async (req, res) => {
    try {
        const userId = req.user._id;

        // Get all conversations
        const messages = await Message.find({
            $or: [{ sender: userId }, { receiver: userId }]
        }).populate('sender receiver', 'name role profileImage')
            .sort({ createdAt: -1 });

        // Group by conversation partner
        const conversations = {};

        messages.forEach(message => {
            const partnerId = message.sender._id.toString() === userId.toString() ?
                message.receiver._id.toString() : message.sender._id.toString();

            if (!conversations[partnerId]) {
                conversations[partnerId] = {
                    partner: message.sender._id.toString() === userId.toString() ?
                        message.receiver : message.sender,
                    messages: [],
                    unreadCount: 0,
                    lastMessage: message
                };
            }

            conversations[partnerId].messages.push(message);

            if (message.receiver._id.toString() === userId.toString() && !message.isRead) {
                conversations[partnerId].unreadCount++;
            }
        });

        res.json({ conversations: Object.values(conversations) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Send message
router.post('/messages', async (req, res) => {
    try {
        const { receiverId, content } = req.body;
        const senderId = req.user._id;

        const message = new Message({
            sender: senderId,
            receiver: receiverId,
            content
        });

        await message.save();
        await message.populate('sender receiver', 'name role profileImage');

        res.json({ message, success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Helper function to calculate grade point
function calculateGradePoint(percentage) {
    if (percentage >= 90) return 10;
    if (percentage >= 80) return 9;
    if (percentage >= 70) return 8;
    if (percentage >= 60) return 7;
    if (percentage >= 50) return 6;
    if (percentage >= 40) return 5;
    return 0;
}


module.exports = router;
