export function startSmtpFixture(options: {
  key: Buffer; cert: Buffer; username: string; password: string;
  implicit?: boolean; advertiseTls?: boolean;
}): Promise<{ messages: string[]; port: number; close: () => Promise<void> }>;
