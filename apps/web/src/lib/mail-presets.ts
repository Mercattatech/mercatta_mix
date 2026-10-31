/** Provedores de SMTP prontos para escolher no painel. Qualquer outro serve em "Personalizado". Sem segredos aqui. */
export interface MailPreset {
  id: string;
  label: string;
  host: string;
  port: number;
  security: "starttls" | "ssl";
  /** Usuário fixo exigido pelo provedor (ex.: "apikey"). Vazio = a pessoa informa. */
  username?: string;
  /** Ajuda mostrada abaixo do formulário. */
  help: string;
}

export const MAIL_PRESETS: MailPreset[] = [
  {
    id: "gmail",
    label: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 587,
    security: "starttls",
    help: "Usuário = o e-mail completo. A senha NÃO é a da conta: ative a verificação em duas etapas e crie uma \"senha de app\" em myaccount.google.com/apppasswords (16 letras). Limite do Google: ~500 e-mails/dia no Gmail comum e ~2.000 no Workspace.",
  },
  {
    id: "hostinger",
    label: "Hostinger (e-mail do seu domínio)",
    host: "smtp.hostinger.com",
    port: 465,
    security: "ssl",
    help: "Crie uma caixa de e-mail no painel da Hostinger (ex.: nao-responda@seudominio.com.br). Usuário = o e-mail completo; senha = a da caixa.",
  },
  {
    id: "resend",
    label: "Resend",
    host: "smtp.resend.com",
    port: 465,
    security: "ssl",
    username: "resend",
    help: "Usuário fixo \"resend\"; a senha é a sua API Key. O domínio de envio precisa estar verificado no Resend.",
  },
  {
    id: "brevo",
    label: "Brevo (Sendinblue)",
    host: "smtp-relay.brevo.com",
    port: 587,
    security: "starttls",
    help: "Usuário = o login SMTP mostrado em SMTP & API no Brevo; senha = a chave SMTP (não a senha da conta).",
  },
  {
    id: "sendgrid",
    label: "SendGrid",
    host: "smtp.sendgrid.net",
    port: 587,
    security: "starttls",
    username: "apikey",
    help: "Usuário fixo \"apikey\"; a senha é a API Key do SendGrid.",
  },
  {
    id: "mailgun",
    label: "Mailgun",
    host: "smtp.mailgun.org",
    port: 587,
    security: "starttls",
    help: "Use as credenciais SMTP do domínio (Sending → Domain settings → SMTP credentials).",
  },
  {
    id: "ses",
    label: "Amazon SES",
    host: "email-smtp.us-east-1.amazonaws.com",
    port: 587,
    security: "starttls",
    help: "Troque us-east-1 pela sua região. Usuário e senha são as credenciais SMTP do SES (não as chaves de acesso da AWS).",
  },
  {
    id: "microsoft",
    label: "Microsoft 365 / Outlook",
    host: "smtp.office365.com",
    port: 587,
    security: "starttls",
    help: "Muitas contas Microsoft bloqueiam login SMTP por senha. Se der erro de autenticação, peça ao administrador do Microsoft 365 para liberar o SMTP autenticado da caixa.",
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    host: "smtp.zoho.com",
    port: 465,
    security: "ssl",
    help: "Use uma senha de aplicativo do Zoho se a conta tiver verificação em duas etapas.",
  },
  {
    id: "custom",
    label: "Personalizado (qualquer SMTP)",
    host: "",
    port: 587,
    security: "starttls",
    help: "Informe o servidor, a porta e o tipo de segurança do seu provedor. Em geral: porta 587 = STARTTLS, porta 465 = SSL/TLS.",
  },
];
