import type { Request, Response } from 'express';
import {
  getApplicationForUserByRef,
  getAuthenticatedUserFromRequest,
} from '../services/applicationService';
import {
  ContractEmailHistoryError,
  getContractEmailContent,
  listContractEmailHistory,
  resendContractEmail,
} from '../services/contractEmailHistoryService';

/**
 * Contract email history for the Contract tab's "View email recipients":
 *   GET  /applications/:id/contract-email-history                    every contract email, newest first
 *   GET  /applications/:id/contract-email-history/:emailId/content   the HTML one of them sent
 *   POST /applications/:id/contract-email-history/:emailId/resend    send it again
 */

/** The application UUID the request may read, or null once an error response is sent. */
async function resolveApplication(req: Request, res: Response): Promise<string | null> {
  const user = getAuthenticatedUserFromRequest(req as never);
  const { application, forbidden } = await getApplicationForUserByRef(String(req.params.id), user);
  if (forbidden) {
    res.status(403).json({ success: false, message: 'Forbidden: you do not have access to this application' });
    return null;
  }
  if (!application) {
    res.status(404).json({ success: false, message: 'Application not found' });
    return null;
  }
  return application.id;
}

function fail(res: Response, err: unknown, fallback: string) {
  if (err instanceof ContractEmailHistoryError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  console.error('[contract-email-history]', err);
  return res.status(500).json({ success: false, message: fallback });
}

export async function getContractEmailHistory(req: Request, res: Response) {
  try {
    const applicationId = await resolveApplication(req, res);
    if (!applicationId) return;
    res.json({ success: true, data: await listContractEmailHistory(applicationId) });
  } catch (err) {
    fail(res, err, 'Could not load the contract email history.');
  }
}

export async function getContractEmailHistoryContent(req: Request, res: Response) {
  try {
    const applicationId = await resolveApplication(req, res);
    if (!applicationId) return;
    res.json({ success: true, data: await getContractEmailContent(applicationId, String(req.params.emailId)) });
  } catch (err) {
    fail(res, err, 'Could not load this email.');
  }
}

export async function resendContractEmailHistory(req: Request, res: Response) {
  try {
    const applicationId = await resolveApplication(req, res);
    if (!applicationId) return;
    const user = getAuthenticatedUserFromRequest(req as never);
    res.json({ success: true, data: await resendContractEmail(applicationId, String(req.params.emailId), user) });
  } catch (err) {
    fail(res, err, 'Could not resend the email.');
  }
}
