# Handoff - Clube do Jogo App

Este documento resume o estado atual do desenvolvimento, arquitetura, regras de negócio e os passos finais necessários para rodar e implantar o aplicativo do **Clube do Jogo**.

---

## 🚀 Visão Geral do Projeto

O aplicativo é um assistente mobile-first projetado para automatizar e otimizar a votação mensal de jogos de um clube presencial. Os membros cadastram jogos do seu backlog e votam neles. O sistema calcula a pontuação com base nos votos e no tempo médio de jogo (playtime) para definir o vencedor do mês.

---

## 🛠️ Stack Tecnológica

* **Framework**: Next.js 16 (App Router) + TypeScript
* **Estilização**: Tailwind CSS v4 + Design Escuro Premium
* **Banco de Dados & Auth**: Supabase (PostgreSQL + RLS + Google OAuth)
* **Inteligência Artificial**: Google Gemini 1.5 Flash (via Google AI Studio) para busca inteligente de jogos com retorno JSON estruturado
* **Ícones**: Lucide React

---

## 📊 Regra de Pontuação (Score Rule)

A pontuação total de cada jogo no mês de votação é calculada da seguinte forma:

$$\text{Pontos} = \text{Votos Computados} \times 2 \times \text{Multiplicador de Duração}$$

### Faixas de Duração (Playtime):
* **< 8h**: Multiplicador = **1x** (2 pts/voto)
* **8h às 12h** (Ideal 10h): Multiplicador = **3x** (6 pts/voto)
* **12h às 20h**: Multiplicador = **2x** (4 pts/voto)
* **> 20h**: Multiplicador = **1x** (2 pts/voto)

*Nota: Os usuários podem votar em quantos jogos quiserem por mês, mas apenas uma única vez por jogo.*

---

## 🗄️ Modelagem de Dados (Supabase)

O arquivo [schema.sql](file:///c:/Users/artur/OneDrive/Documentos/Clube%20do%20Jogo/schema.sql) na raiz contém o script PostgreSQL para criar as seguintes tabelas públicas:

1. **`profiles`**: Informações de perfil dos usuários extraídas automaticamente via login do Google.
2. **`games`**: Catálogo global de jogos adicionados, com título, imagem, duração estimada e descrição.
3. **`backlogs`**: Fila individual de jogos de cada membro do clube.
4. **`votes`**: Votos do mês corrente estruturados com chave única `(user_id, game_id, vote_month)`.

---

## ⚙️ Variáveis de Ambiente (`.env.local`)

Crie um arquivo `.env.local` na raiz baseado no exemplo [.env.example](file:///c:/Users/artur/OneDrive/Documentos/Clube%20do%20Jogo/.env.example):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=sua-url-do-supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-public-do-supabase

# Google Gemini (AI Studio)
GEMINI_API_KEY=sua-chave-de-api-gratuita-do-gemini
```

---

## 📲 Como Executar Localmente

Como o Node.js já está instalado na máquina, execute no terminal da pasta raiz:

1. **Instalar dependências**:
   ```bash
   npm install
   ```

2. **Iniciar servidor de desenvolvimento**:
   ```bash
   npm run dev
   ```

3. **Acessar o app**:
   Abra `http://localhost:3000` no seu navegador (use o modo de simulação móvel do inspecionar elemento para melhor experiência).

---

## ⚙️ Configuração do Google Auth no Supabase

1. Vá no console do **Google Cloud** e crie uma credencial de **OAuth Client ID** para Web Application.
2. No painel do **Supabase**, vá em **Authentication** > **Providers** > **Google**:
   * Ative o provedor.
   * Cole o *Client ID* e *Client Secret* fornecidos pelo Google Cloud.
   * Copie o *Redirect URI* gerado pelo Supabase e cole na configuração de URIs autorizados da sua credencial no Google Cloud.
3. No painel do **Supabase** > **Authentication** > **URL Configuration**:
   * Adicione o endereço local (`http://localhost:3000`) e o de produção da Vercel (`https://seu-app.vercel.app`) em **Redirect URLs**.
   * Adicione `/auth/callback` ao final de cada URL.

---

## 🚀 Deploy no Vercel

1. Suba o projeto para o seu repositório no GitHub.
2. Crie um novo projeto na Vercel e conecte o repositório.
3. Configure as 3 variáveis de ambiente (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `GEMINI_API_KEY`).
4. Execute o Deploy!
