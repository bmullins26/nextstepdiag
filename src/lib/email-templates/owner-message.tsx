import React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  subject?: string;
  message?: string;
  recipientName?: string | null;
  senderName?: string;
  replyTo?: string | null;
}

const main = { backgroundColor: "#ffffff", fontFamily: "Helvetica, Arial, sans-serif" };
const container = { maxWidth: "560px", margin: "0 auto", padding: "32px 24px" };
const brand = {
  margin: "0 0 24px",
  fontSize: "13px",
  letterSpacing: "0.18em",
  textTransform: "uppercase" as const,
  color: "#111111",
  fontWeight: 700,
};
const heading = { margin: "0 0 16px", fontSize: "22px", lineHeight: "30px", color: "#111111" };
const body = { margin: "0 0 14px", fontSize: "15px", lineHeight: "24px", color: "#333333" };
const hr = { borderColor: "#e5e5e5", margin: "28px 0 16px" };
const foot = { margin: 0, fontSize: "12px", lineHeight: "20px", color: "#777777" };

const OwnerMessageEmail = ({
  subject,
  message,
  recipientName,
  senderName,
  replyTo,
}: Props) => {
  const paragraphs = (message ?? "").split(/\n{2,}/).filter(Boolean);
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{subject || "A message from NextStep Diagnostics"}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>NextStep Diagnostics</Text>
          <Heading style={heading}>{subject || "A message from NextStep"}</Heading>
          <Text style={body}>Hi {recipientName || "there"},</Text>
          <Section>
            {paragraphs.length > 0 ? (
              paragraphs.map((p, i) => (
                <Text key={i} style={body}>
                  {p.split("\n").map((line, j) => (
                    <React.Fragment key={j}>
                      {j > 0 ? <br /> : null}
                      {line}
                    </React.Fragment>
                  ))}
                </Text>
              ))
            ) : (
              <Text style={body}>{message}</Text>
            )}
          </Section>
          <Text style={body}>— {senderName || "The NextStep team"}</Text>
          <Hr style={hr} />
          <Text style={foot}>
            {replyTo
              ? `You can reply directly to ${replyTo}.`
              : "This message was sent from NextStep Diagnostics."}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: OwnerMessageEmail,
  subject: (data: Record<string, any>) =>
    (data?.subject as string) || "A message from NextStep Diagnostics",
  displayName: "Owner message",
  previewData: {
    subject: "Quick question about your beta feedback",
    message: "Thanks for the bug report.\n\nCould you tell me which model you were testing?",
    recipientName: "Jane",
    senderName: "NextStep Support",
    replyTo: "support@nextstepdiag.com",
  },
} satisfies TemplateEntry;
