const express = require('express');
const router = express.Router();

const { enrollCourse, getMyEnrollments, updateProgress, checkEnrollment, enrollCourseBypass, getLearningCourse, markLessonComplete } = require('../controllers/enrollment.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All enrollment routes require login
router.use(authenticate);

router.post('/:courseId', authorize('STUDENT', 'INSTRUCTOR', 'SUPERADMIN'), enrollCourse);
router.post('/enrollmentsByPass/:courseId', authorize('STUDENT', 'INSTRUCTOR', 'SUPERADMIN'), enrollCourseBypass);
router.get('/my', getMyEnrollments);

router.get('/learn/:id', getLearningCourse);

router.get('/:courseId/check', checkEnrollment);
router.patch('/:courseId/progress', updateProgress);

router.patch('/lesson/:lessonId/complete', markLessonComplete);

module.exports = router;
