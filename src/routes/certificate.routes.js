// routes/certificate.routes.js

const express = require('express');
const router = express.Router();

const {
  generateCertificate,
  getMyCertificates,
  getCertificateById
} = require('../controllers/certificate.controller');

const {
  authenticate
} = require('../middlewares/auth.middleware');

router.get(
  '/',
  authenticate,
  getMyCertificates
);

router.get(
  '/:id',
  authenticate,
  getCertificateById
);

router.post(
  '/generate/:courseId',
  authenticate,
  generateCertificate
);

module.exports = router;