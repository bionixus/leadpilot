import Imap from 'imap';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser';
import { decrypt } from '@/lib/encryption';
import { getValidOAuthToken } from '@/lib/email/oauth';

export type EmailAccountForFetch = {
  id: string;
  email_address: string;
  provider: string;
  oauth_access_token_encrypted: string | null;
  oauth_refresh_token_encrypted: string | null;
  oauth_token_expires_at: string | null;
  credentials_encrypted: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_secure: boolean | null;
  last_synced_at: string | null;
};

export type FetchedEmail = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: { address: string; name: string | null };
  to: { address: string; name: string | null }[];
  cc: { address: string; name: string | null }[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  date: Date | null;
  attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
  }>;
  uid: number;
};

/**
 * Build XOAUTH2 authentication string for IMAP.
 */
function buildXOAuth2Token(email: string, accessToken: string): string {
  const authString = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
  return Buffer.from(authString).toString('base64');
}

/**
 * Extract address from mailparser AddressObject.
 */
function extractAddresses(
  addr: AddressObject | AddressObject[] | undefined
): Array<{ address: string; name: string | null }> {
  if (!addr) return [];
  const addrArray = Array.isArray(addr) ? addr : [addr];
  const result: Array<{ address: string; name: string | null }> = [];
  for (const a of addrArray) {
    if (a.value) {
      for (const v of a.value) {
        if (v.address) {
          result.push({ address: v.address, name: v.name || null });
        }
      }
    }
  }
  return result;
}

/**
 * Connect to IMAP and fetch new emails for an account.
 */
export async function fetchNewEmails(
  account: EmailAccountForFetch
): Promise<FetchedEmail[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let imapConfig: any;

  if (account.provider === 'gmail') {
    const accessToken = await getValidOAuthToken(account);
    const xoauth2 = buildXOAuth2Token(account.email_address, accessToken);

    imapConfig = {
      user: account.email_address,
      xoauth2,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { servername: 'imap.gmail.com' },
      authTimeout: 10000,
    };
  } else if (account.provider === 'outlook') {
    const accessToken = await getValidOAuthToken(account);
    const xoauth2 = buildXOAuth2Token(account.email_address, accessToken);

    imapConfig = {
      user: account.email_address,
      xoauth2,
      host: 'outlook.office365.com',
      port: 993,
      tls: true,
      tlsOptions: { servername: 'outlook.office365.com' },
      authTimeout: 10000,
    };
  } else if (account.provider === 'custom') {
    const credEnc = account.credentials_encrypted;
    if (!credEnc) throw new Error('No credentials for custom account');

    const cred = JSON.parse(decrypt(credEnc)) as {
      username: string;
      password: string;
    };

    const host = account.imap_host;
    const port = account.imap_port ?? 993;
    const secure = account.imap_secure !== false;

    if (!host) throw new Error('No IMAP host configured');

    imapConfig = {
      user: cred.username,
      password: cred.password,
      host,
      port,
      tls: secure,
      authTimeout: 10000,
    };
  } else {
    throw new Error(`Unknown provider: ${account.provider}`);
  }

  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);
    const parsePromises: Promise<void>[] = [];
    const emails: FetchedEmail[] = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) {
          imap.end();
          return reject(new Error(`Failed to open INBOX: ${err.message}`));
        }

        // Search criteria: UNSEEN or since last sync
        let searchCriteria: (string | string[])[];

        if (account.last_synced_at) {
          const since = new Date(account.last_synced_at);
          searchCriteria = [['SINCE', since.toISOString().slice(0, 10)]];
        } else {
          searchCriteria = ['UNSEEN'];
        }

        imap.search(searchCriteria, (searchErr, uids) => {
          if (searchErr) {
            imap.end();
            return reject(new Error(`Search failed: ${searchErr.message}`));
          }

          if (!uids || uids.length === 0) {
            imap.end();
            return resolve([]);
          }

          // Limit to 100 messages at a time
          const limitedUids = uids.slice(0, 100);

          const fetch = imap.fetch(limitedUids, {
            bodies: '',
            struct: true,
          });

          fetch.on('message', (msg) => {
            let uid = 0;
            let buffer = '';

            msg.on('body', (stream) => {
              stream.on('data', (chunk: Buffer) => {
                buffer += chunk.toString('utf8');
              });
            });

            msg.once('attributes', (attrs) => {
              uid = attrs.uid;
            });

            // Collect the parse promise so we can await them all
            const parsePromise = new Promise<void>((resolveMsg) => {
              msg.once('end', async () => {
                try {
                  const parsed: ParsedMail = await simpleParser(buffer);

                  const from = extractAddresses(parsed.from);
                  const to = extractAddresses(parsed.to);
                  const cc = extractAddresses(parsed.cc);

                  const references: string[] = [];
                  if (parsed.references) {
                    if (Array.isArray(parsed.references)) {
                      references.push(...parsed.references);
                    } else {
                      references.push(parsed.references);
                    }
                  }

                  const attachments = (parsed.attachments || []).map((att) => ({
                    filename: att.filename || 'attachment',
                    mimeType: att.contentType || 'application/octet-stream',
                    size: att.size || 0,
                  }));

                  emails.push({
                    messageId: parsed.messageId || null,
                    inReplyTo: parsed.inReplyTo || null,
                    references,
                    from: from[0] || { address: 'unknown', name: null },
                    to,
                    cc,
                    subject: parsed.subject || null,
                    bodyText: parsed.text || null,
                    bodyHtml: parsed.html || null,
                    date: parsed.date || null,
                    attachments,
                    uid,
                  });
                } catch (parseErr) {
                  console.error('Failed to parse email:', parseErr);
                } finally {
                  resolveMsg();
                }
              });
            });
            parsePromises.push(parsePromise);
          });

          fetch.once('error', (fetchErr: Error) => {
            imap.end();
            reject(new Error(`Fetch failed: ${fetchErr.message}`));
          });

          fetch.once('end', () => {
            // Wait for all async parse operations to complete before closing
            Promise.all(parsePromises).then(() => {
              imap.end();
            });
          });
        });
      });
    });

    imap.once('error', (imapErr: Error) => {
      reject(new Error(`IMAP error: ${imapErr.message}`));
    });

    imap.once('end', () => {
      resolve(emails);
    });

    imap.connect();
  });
}

/**
 * Generate a snippet from body text (first ~200 chars).
 */
export function generateSnippet(text: string | null | undefined, maxLen = 200): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 3) + '...';
}
