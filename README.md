# Clube do Jogo

App mobile-first para votação mensal, jogo do mês, comentários, progresso e backlog do clube.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Abra [http://localhost:3000](http://localhost:3000). Sem variáveis do Supabase, o app entra automaticamente no modo de demonstração local para permitir validar todas as telas.

## Banco de dados

Em um projeto novo, execute `schema.sql` no SQL Editor do Supabase. Em seguida — ou em uma instalação existente — execute, nesta ordem:

1. `migration_monthly_club.sql`
2. `migration_admin_cycles_game_data.sql`

A segunda migração adiciona cargos, histórico administrativo, ciclos encerrados manualmente no encontro, progresso permanente por jogo e anotações privadas sincronizadas. Ao encerrar um ciclo, ela também salva fotografias imutáveis do progresso do clube e das anotações privadas para que a consulta daquele mês permaneça parada no tempo. Ela consolida os registros mensais de progresso existentes e preserva os jogos já marcados como finalizados.

Como o banco antigo não guardava essas fotografias, ciclos encerrados antes da aplicação da migration recebem um backfill com o melhor estado disponível no momento da atualização. A partir do primeiro encerramento posterior à migration, o estado salvo é exatamente o estado da transação que encerrou o ciclo.

Decisões administrativas de ciclo ficam registradas e podem ser desfeitas em sequência. Se o ciclo já recebeu comentários, reações ou votos, a interface informa as quantidades e exige uma confirmação destrutiva. Depois de desfazer, o administrador tem 5 minutos para refazer; qualquer nova definição manual invalida os redos pendentes.

Depois de criar o usuário administrativo em **Authentication → Users**, promova-o pelo SQL Editor, substituindo o e-mail:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'admin@seu-dominio.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin', updated_at = NOW();
```

Senhas nunca devem ser gravadas nas migrations nem no repositório.

## Variáveis de ambiente

Crie `.env.local` na raiz:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON
IGDB_CLIENT_ID=SEU_CLIENT_ID_TWITCH
IGDB_CLIENT_SECRET=SEU_CLIENT_SECRET_TWITCH
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Na Vercel, cadastre as mesmas variáveis em **Project → Settings → Environment Variables**, mas configure:

```env
NEXT_PUBLIC_SITE_URL=https://seu-dominio-de-producao.com
```

Use sempre o domínio canônico, sem barra no fim. Se `NEXT_PUBLIC_SITE_URL` não existir, o callback usa primeiro `VERCEL_PROJECT_PRODUCTION_URL` (fornecida automaticamente pela Vercel) e depois `VERCEL_URL`.

No Supabase, abra **Authentication → URL Configuration**:

1. Defina **Site URL** como `https://seu-dominio-de-producao.com`.
2. Em **Redirect URLs**, adicione `http://localhost:3000/auth/callback` e `https://seu-dominio-de-producao.com/auth/callback`.
3. Para previews da Vercel, adicione também `https://*-<slug-do-time-ou-conta>.vercel.app/**` somente se quiser permitir login nos previews (substitua o trecho entre `< >`). Esse é o padrão recomendado pelo [Supabase](https://supabase.com/docs/guides/auth/redirect-urls#vercel-preview-urls).
4. Se você personalizou o template de confirmação de e-mail e ele monta o link com `{{ .SiteURL }}`, troque-o por `{{ .RedirectTo }}` para respeitar o `emailRedirectTo` enviado pelo app.

O cadastro envia explicitamente `emailRedirectTo` para `/auth/callback`, e o callback valida o caminho de retorno para impedir redirects externos. A Vercel fornece `VERCEL_PROJECT_PRODUCTION_URL` e `VERCEL_URL` sem o protocolo; o código acrescenta `https://` no servidor.

As anotações (texto e imagens) são privadas e sincronizadas pelo Supabase, com políticas que permitem acesso somente ao proprietário. Ao abrir um jogo pela primeira vez depois da atualização, anotações antigas do IndexedDB daquele dispositivo são migradas automaticamente.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
