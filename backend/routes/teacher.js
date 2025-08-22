const express = require('express');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Assignment = require('../models/Assignment');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const Message = require('../models/Message');
const { auth, authorize } = require('../middleware/auth');
const multer = require('multer');
const router = express.Router();

// Apply middleware
router.use(auth);
router.use(authorize(['teacher']));
// Add this near the top of admin.js and teacher.js (after other imports)
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

// Dashboard data
// Teacher dashboard
// Fix the teacher dashboard route to use the User's subjects array
router.get('/dashboard', async (req, res) => {
    try {
        const teacherId = req.user.id;
        console.log('🔍 DEBUG: Teacher ID:', teacherId);

        // Get teacher with populated subjects from User model (not Subject model)
        const teacher = await User.findById(teacherId)
            .populate({
                path: 'subjects',
                populate: [
                    { path: 'class', select: 'name branch year section totalStudents' },
                    { path: 'teacher', select: 'name email' }
                ]
            });

        console.log('👨‍🏫 Teacher found:', teacher ? teacher.name : 'NOT FOUND');
        console.log('📚 Populated subjects:', teacher.subjects ? teacher.subjects.length : 0);

        const subjects = teacher.subjects || [];

        // Calculate stats from populated subjects
        const totalSubjects = subjects.length;
        const totalStudents = subjects.reduce((sum, subject) =>
            sum + (subject.class?.totalStudents || 0), 0);

        // Get recent assignments
        const recentAssignments = await Assignment.find({
            teacher: teacherId
        })
            .populate('subject', 'name code')
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({
            totalSubjects,
            totalStudents,
            totalClasses: subjects.length,
            todayAttendanceMarked: 0,
            subjects,
            recentAssignments
        });

    } catch (error) {
        console.error('❌ Dashboard error:', error.message);
        res.status(500).json({ message: error.message });
    }
});

// Fix teacher subjects route to properly populate class data
router.get('/subjects', async (req, res) => {
    try {
        const teacherId = req.user.id;
        console.log('🔍 DEBUG SUBJECTS: Teacher ID:', teacherId);

        // Get teacher with properly populated subjects and their class data
        const teacher = await User.findById(teacherId).populate({
            path: 'subjects',
            select: 'name code credits class',
            populate: {
                path: 'class',
                select: 'name branch year section totalStudents'
            }
        });

        console.log('📚 Subjects with class data:', JSON.stringify(teacher.subjects, null, 2));

        // Use populated subjects
        const subjects = teacher.subjects || [];

        console.log('✅ Sending subjects to frontend:', subjects.length);
        subjects.forEach((subject, index) => {
            console.log(`   ${index + 1}. ${subject.name} - ${subject.code} - Class: ${subject.class?.name || 'No class'} (${subject.class?.branch || '?'} Year ${subject.class?.year || '?'})`);
        });

        res.json({ subjects });
    } catch (error) {
        console.error('❌ Subjects route error:', error.message);
        res.status(500).json({ message: error.message });
    }
});

// Get students for a subject
router.get('/students/:subjectId', async (req, res) => {
    try {
        const subjectId = req.params.subjectId;

        // Verify teacher owns this subject
        const subject = await Subject.findOne({
            _id: subjectId,
            teacher: req.user.id
        }).populate('class');

        if (!subject) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const students = await User.find({
            classId: subject.class._id,
            role: 'student',
            isActive: true
        }).select('name rollNumber profileImage').sort({ rollNumber: 1 });

        res.json({ students, subject: subject.name });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Mark attendance
router.post('/attendance', async (req, res) => {
    try {
        const { studentId, status, subjectId, date } = req.body;
        const teacherId = req.user.id;

        // Verify teacher owns this subject
        const subject = await Subject.findOne({
            _id: subjectId,
            teacher: teacherId
        });

        if (!subject) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const attendanceDate = new Date(date);
        attendanceDate.setHours(0, 0, 0, 0);

        const attendance = await Attendance.findOneAndUpdate(
            {
                student: studentId,
                subject: subjectId,
                date: attendanceDate
            },
            {
                status,
                markedBy: teacherId,
                markedAt: new Date()
            },
            { upsert: true, new: true }
        ).populate('student', 'name rollNumber');

        res.json({
            message: 'Attendance marked successfully',
            attendance
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Add this route to teacher.js - fixes the data issue
router.post('/fix-my-subjects', async (req, res) => {
    try {
        const teacherId = req.user.id;

        // Get this teacher's subjects from User model and fix them
        const teacher = await User.findById(teacherId).populate('subjects');

        let fixedCount = 0;
        for (const subject of teacher.subjects) {
            // Update each subject to have this teacher's ID
            await Subject.findByIdAndUpdate(subject._id, { teacher: teacherId });
            fixedCount++;
        }

        console.log(`✅ Fixed ${fixedCount} subjects for ${req.user.name}`);
        res.json({ message: `Fixed ${fixedCount} subjects for ${req.user.name}` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get students for attendance (teacher only, must own subject)
router.get('/attendance/:subjectId', async (req, res) => {
    try {
        const { subjectId } = req.params;
        const teacherId = req.user.id; // comes from JWT via auth middleware

        // Verify user is a teacher
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ message: 'Access deny, false' });
        }

        // Verify the subject exists and belongs to this teacher
        const subject = await Subject.findOne({
            _id: subjectId,
            teacher: teacherId
        }).populate('class');

        if (!subject) {
            return res.status(403).json({ message: 'Access deny,false' });
        }

        // Get students of the subject's class
        const students = await User.find({
            classId: subject.class._id,
            role: 'student',
            isActive: true
        })
            .select('name rollNumber profileImage')
            .sort({ rollNumber: 1 });

        res.json({
            students,
            subject: {
                _id: subject._id,
                name: subject.name,
                code: subject.code,
                class: subject.class
            }
        });

    } catch (error) {
        console.error('❌ Attendance route error:', error.message);
        res.status(500).json({ message: error.message });
    }
});



// Create assignment - with proper ObjectId handling
router.post('/assignments', async (req, res) => {
    try {
        console.log('📍 Assignment data received:', req.body);

        const { subjectId, title, description, dueDate, maxMarks, instructions } = req.body;

        if (!subjectId || subjectId === '') {
            return res.status(400).json({ message: 'Subject is required' });
        }

        // ✅ Create a proper ObjectId for teacher or use actual teacher ID
        const teacherId = req.user?.id || new mongoose.Types.ObjectId(); // Use logged-in user or generate new ObjectId

        const assignment = new Assignment({
            title,
            subject: subjectId,
            dueDate: new Date(dueDate),
            maxMarks: parseInt(maxMarks),
            description: description || '',
            instructions: instructions || '',
            teacher: teacherId // ✅ Now uses proper ObjectId
        });

        await assignment.save();
        console.log('✅ Assignment created successfully');
        res.json({ message: 'Assignment created successfully' });
    } catch (error) {
        console.error('❌ Error:', error.message);
        res.status(500).json({ message: error.message });
    }
});


// Get assignments
router.get('/assignments', async (req, res) => {
    try {
        const teacherId = req.user.id;
        const { subjectId } = req.query;

        let query = { teacher: teacherId };
        if (subjectId) {
            query.subject = subjectId;
        }

        const assignments = await Assignment.find(query)
            .populate('subject', 'name code')
            .sort({ createdAt: -1 });

        // Add submission counts
        const assignmentsWithCounts = assignments.map(assignment => ({
            ...assignment.toObject(),
            totalSubmissions: assignment.submissions.length,
            gradedSubmissions: assignment.submissions.filter(sub => sub.grade).length
        }));

        res.json({ assignments: assignmentsWithCounts });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
// Add this route to backend/routes/teacher.js
router.delete('/assignments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🗑️ Deleting assignment:', id);

        const deletedAssignment = await Assignment.findByIdAndDelete(id);

        if (!deletedAssignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        console.log('✅ Assignment deleted successfully');
        res.json({ message: 'Assignment deleted successfully' });
    } catch (error) {
        console.error('❌ Delete error:', error.message);
        res.status(500).json({ message: error.message });
    }
});

// Get assignment submissions
router.get('/assignments/:id/submissions', async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const teacherId = req.user.id;

        const assignment = await Assignment.findOne({
            _id: assignmentId,
            teacher: teacherId
        }).populate({
            path: 'submissions.student',
            select: 'name rollNumber profileImage'
        }).populate('subject', 'name code');

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        res.json({ assignment });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Grade assignment
router.put('/assignments/:assignmentId/grade/:submissionId', async (req, res) => {
    try {
        const { assignmentId, submissionId } = req.params;
        const { marks, feedback } = req.body;
        const teacherId = req.user.id;

        const assignment = await Assignment.findOne({
            _id: assignmentId,
            teacher: teacherId
        });

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        const submission = assignment.submissions.id(submissionId);
        if (!submission) {
            return res.status(404).json({ message: 'Submission not found' });
        }

        submission.grade = {
            marks: Number(marks),
            feedback,
            gradedAt: new Date(),
            gradedBy: teacherId
        };

        await assignment.save();

        res.json({
            message: 'Assignment graded successfully',
            submission
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
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

// Messages (same as student but with teacher authorization)
router.get('/messages', async (req, res) => {
    try {
        const userId = req.user.id;

        const messages = await Message.find({
            $or: [{ sender: userId }, { receiver: userId }]
        }).populate('sender receiver', 'name role profileImage')
            .sort({ createdAt: -1 });

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

router.post('/messages', async (req, res) => {
    try {
        const { receiverId, content } = req.body;
        const senderId = req.user.id;

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

module.exports = router;
