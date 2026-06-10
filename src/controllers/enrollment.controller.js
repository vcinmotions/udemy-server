const { prisma } = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response');

async function enrollCourseBypass(req, res, next) {
  try {
    const { courseId } = req.params;

    const course = await prisma.course.findFirst({
      where: {
        id: courseId,
        isPublished: true,
        isApproved: true,
      },
    });

    if (!course) {
      return errorResponse(res, {
        statusCode: 404,
        message: 'Course not found.',
      });
    }

    const existingEnrollment =
      await prisma.enrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: req.user.id,
            courseId,
          },
        },
      });

    if (existingEnrollment) {
      return errorResponse(res, {
        statusCode: 409,
        message: 'Already enrolled.',
      });
    }

    // create enrollment
    const enrollment =
      await prisma.enrollment.create({
        data: {
          studentId: req.user.id,
          courseId,
        },
      });

    // create FREE order
    await prisma.order.create({
      data: {
        amount: course.price,
        originalAmount:
          course.originalPrice || course.price,

        currency: 'inr',

        status: 'COMPLETED',

        paymentMethod: 'FREE',

        courseTitle: course.title,
        coursePriceSnapshot: course.price,

        studentId: req.user.id,
        courseId: course.id,

        enrollmentId: enrollment.id,
      },
    });

    // increase count
    await prisma.course.update({
      where: { id: courseId },
      data: {
        studentCount: {
          increment: 1,
        },
      },
    });

    return successResponse(res, {
      statusCode: 201,
      message: 'Enrollment successful.',
      data: {
        enrollment,
      },
    });
  } catch (error) {
    next(error);
  }
}

// POST /enrollments/:courseId — Enroll in course
async function enrollCourse(req, res, next) {
  try {
    const { courseId } = req.params;

    const course = await prisma.course.findFirst({
      where: { id: courseId, isPublished: true, isApproved: true },
    });
    if (!course) return errorResponse(res, { statusCode: 404, message: 'Course not found.' });

    const existing = await prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: req.user.id, courseId } },
    });
    if (existing) {
      return errorResponse(res, { statusCode: 409, message: 'Already enrolled in this course.' });
    }

    const enrollment = await prisma.enrollment.create({
      data: { studentId: req.user.id, courseId },
      include: { course: { select: { id: true, title: true, image: true } } },
    });

    // Increment student count
    await prisma.course.update({ where: { id: courseId }, data: { studentCount: { increment: 1 } } });

    return successResponse(res, { statusCode: 201, message: 'Enrolled successfully.', data: { enrollment } });
  } catch (error) {
    next(error);
  }
}

// GET /enrollments/my — Student's enrolled courses
async function getMyEnrollments(req, res, next) {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [total, enrollments] = await Promise.all([
      prisma.enrollment.count({ where: { studentId: req.user.id } }),
      prisma.enrollment.findMany({
        where: { studentId: req.user.id },
        include: {
          course: {
            include: {
              instructor: { select: { id: true, name: true, avatar: true } },
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { enrolledAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
    ]);

    return successResponse(res, {
      data: { enrollments },
      meta: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (error) {
    next(error);
  }
}

async function getLearningCourse(
  req,
  res,
  next
) {
  try {
    const { id } = req.params;

    console.log("User:", req.user.id);
    console.log("Course:", id);

    const allEnrollments = await prisma.enrollment.findMany({
      where: {
        studentId: req.user.id
      }
    });

    console.log("Enrollments:", allEnrollments);

    const enrollment =
      await prisma.enrollment.findFirst({
        where: {
          studentId: req.user.id,

          courseId: id,
        },

        include: {
          course: {
            include: {
              instructor: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                },
              },

              sections: {
                include: {
                  lessons: {
                    include: {
                      progress : {
                        where: {
                          studentId: req.user.id,
                        },
                      }
                    }
                  },
                },

                orderBy: {
                  order: 'asc',
                },
              },
            },
          },
        },
      });

    if (!enrollment) {
      return errorResponse(res, {
        statusCode: 404,
        message:
          'Course not enrolled.',
      });
    }

    return successResponse(res, {
      data: {
        enrollment,
      },
    });
  } catch (error) {
    next(error);
  }
}

// PATCH /enrollments/:courseId/progress — Update progress
async function updateProgress(req, res, next) {
  try {
    const { courseId } = req.params;
    const { progress } = req.body;

    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      return errorResponse(res, { statusCode: 422, message: 'Progress must be a number between 0 and 100.' });
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: req.user.id, courseId } },
    });
    if (!enrollment) return errorResponse(res, { statusCode: 404, message: 'Enrollment not found.' });

    const updated = await prisma.enrollment.update({
      where: { studentId_courseId: { studentId: req.user.id, courseId } },
      data: {
        progress,
        completedAt: progress === 100 ? new Date() : null,
      },
    });

    return successResponse(res, { message: 'Progress updated.', data: { enrollment: updated } });
  } catch (error) {
    next(error);
  }
}

// PATCH /enrollments/lesson/:lessonId/complete
async function markLessonComplete(req, res, next) {
  try {
    const { lessonId } = req.params;

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        section: {
          include: {
            course: true,
          },
        },
      },
    });

    if (!lesson) {
      return errorResponse(res, {
        statusCode: 404,
        message: 'Lesson not found',
      });
    }

    await prisma.lessonProgress.upsert({
      where: {
        studentId_lessonId: {
          studentId: req.user.id,
          lessonId,
        },
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
      create: {
        studentId: req.user.id,
        lessonId,
        completed: true,
        completedAt: new Date(),
      },
    });

    const courseId = lesson.section.courseId;

    const totalLessons = await prisma.lesson.count({
      where: {
        section: {
          courseId,
        },
      },
    });

    const completedLessons = await prisma.lessonProgress.count({
      where: {
        studentId: req.user.id,
        completed: true,
        lesson: {
          section: {
            courseId,
          },
        },
      },
    });

    const progress = Math.round(
      (completedLessons / totalLessons) * 100
    );

    const enrollment = await prisma.enrollment.update({
      where: {
        studentId_courseId: {
          studentId: req.user.id,
          courseId,
        },
      },
      data: {
        progress,
        completedAt: progress === 100 ? new Date() : null,
      },
    });

    // after enrollment update

    let certificate = null;
    let certificateGenerated = false;

    if (progress === 100) {
      const existingCertificate = await prisma.certificate.findFirst({
        where: {
          studentId: req.user.id,
          courseId,
        },
      });

      if (!existingCertificate) {
        const certificateNo =
        `CERT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        
        certificate = await prisma.certificate.create({
          data: {
            certificateNo: certificateNo,
            studentId: req.user.id,
            courseId,
          },
        });

        certificateGenerated = true;
      } else {
        certificate = existingCertificate;
      }
    }

    return successResponse(res, {
      message:
        progress === 100
          ? 'Course completed successfully'
          : 'Lesson completed',
      data: {
        progress,
        enrollment,
        certificate,
        certificateGenerated,
      },
    });

    // return successResponse(res, {
    //   message: 'Lesson completed',
    //   data: {
    //     progress,
    //     enrollment,
    //   },
    // });
  } catch (error) {
    next(error);
  }
}

// GET /enrollments/:courseId/check — Check if enrolled
async function checkEnrollment(req, res, next) {
  try {
    const { courseId } = req.params;

    const enrollment = await prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: req.user.id, courseId } },
    });

    return successResponse(res, { data: { enrolled: !!enrollment, enrollment } });
  } catch (error) {
    next(error);
  }
}

module.exports = { enrollCourse, getMyEnrollments, markLessonComplete, updateProgress, checkEnrollment, enrollCourseBypass, getLearningCourse };
