import { Router } from 'express';
import multer from 'multer';
import { authenticateToken } from '../../middleware/authMiddleware';
import {
    getDropboxSignCapabilities,
    sendSignatureRequest,
    getEmbeddedRequestUrl,
    getEmbeddedSignLink,
    getStatus,
    listRequests,
    cancelRequest,
    remindSigner,
    downloadPdf,
    dropboxSignWebhook,
} from './dropboxsign.controller';

const router = Router();

/** PDFs stay in memory and stream straight to Dropbox Sign (25 MB request cap there). */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.get('/capabilities', authenticateToken, getDropboxSignCapabilities);

router.post('/send', authenticateToken, upload.any(), sendSignatureRequest);
router.post('/embedded-request-url', authenticateToken, upload.any(), getEmbeddedRequestUrl);
router.post('/embedded-sign-link', authenticateToken, getEmbeddedSignLink);

router.get('/status/:signatureRequestId', authenticateToken, getStatus);
router.get('/list', authenticateToken, listRequests);
router.post('/cancel', authenticateToken, cancelRequest);
router.post('/remind', authenticateToken, remindSigner);
router.get('/download/:signatureRequestId', authenticateToken, downloadPdf);

/**
 * Event callback registered on the Dropbox Sign API App — multipart with a
 * "json" field. Parse failures (proxy-truncated bodies, malformed test POSTs)
 * must still be acknowledged with 200/"Hello API Event Received", or Dropbox
 * Sign marks the callback broken — so multer errors are swallowed here.
 */
router.post(
    '/webhook',
    (req, res, next) => {
        upload.none()(req, res, (err?: unknown) => {
            if (err) {
                console.warn(
                    '[dropboxsign] Webhook multipart parse failed (acknowledging anyway):',
                    (err as { message?: string })?.message || err,
                );
                (req as { body?: unknown }).body = (req as { body?: unknown }).body ?? {};
            }
            next();
        });
    },
    dropboxSignWebhook,
);

export default router;
