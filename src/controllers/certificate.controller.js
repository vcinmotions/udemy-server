// controllers/certificate.controller.js

const prisma = require('../config/prisma');
const { v4: uuid } = require('uuid');

exports.generateCertificate = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { courseId } = req.params;

    const enrollment =
      await prisma.enrollment.findFirst({
        where: {
          studentId,
          courseId
        },

        include: {
          course: true
        }
      });

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }

    if (enrollment.progress < 100) {
      return res.status(400).json({
        success: false,
        message: 'Course not completed'
      });
    }

    const existing =
      await prisma.certificate.findUnique({
        where: {
          studentId_courseId: {
            studentId,
            courseId
          }
        }
      });

    if (existing) {
      return res.json({
        success: true,
        data: existing
      });
    }

    const certificate =
      await prisma.certificate.create({
        data: {
          certificateNo:
            `CERT-${Date.now()}`,

          studentId,

          courseId
        },

        include: {
          student: true,
          course: true
        }
      });

    return res.status(201).json({
      success: true,
      data: certificate
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to generate certificate'
    });
  }
};