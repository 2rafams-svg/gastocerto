# GastoCerto — documento do projeto

Referência única do projeto: o que ele é, como está montado, o que está no ar, o que foi
abandonado, as regras que toda alteração precisa seguir, e o passo a passo para migrar
tudo para outra conta.

Versão do app na data deste documento: **5.12** · Última atualização: **21/09/2026**

---

## 1. O que é

PWA de controle de gastos por categoria, em português, focado em celular (iPhone em
especial). Cada categoria tem um teto mensal e o app existe para você respeitar esse teto.
Tem ainda um módulo de dividir contas com amigos, separado do controle pessoal.

**Não é** ferramenta de planejamento futuro no sentido de projetar receita e saldo em
conta — isso foi tentado e removido, ver [seção 8](#8-o-que-foi-abandonado). O que existe
desde a v5.9 é uma leitura do que **já está comprometido** para frente, derivada só do que
está lançado: [seção 5.1](#51-próximos-meses-v59).

### Stack

| | |
|---|---|
| Front-end | HTML + CSS + JavaScript puro. **Sem framework, sem build, sem bundler, sem npm.** |
| Back-end | Supabase — Postgres + Auth + PostgREST |
| Acesso ao banco | `fetch` direto na API REST. **O SDK do Supabase não é usado.** |
| Hospedagem | GitHub Pages, servindo a branch `main` na raiz |
| Repositório | `2rafams-svg/gastocerto` |
| URL | `https://2rafams-svg.github.io/gastocerto/` |
| Ícones | Font Awesome 6.7.2 por CDN |
| Fontes | Sora (títulos) + DM Sans (corpo), por Google Fonts |

Abrir o `index.html` num servidor estático qualquer já roda o app. Para desenvolver:

```bash
cd /c/Users/Rafa/source/repos/GastoCerto && python -m http.server 8000
```

### Arquivos

```
index.html      Casca: telas de PIN, login, app e modais. 145 linhas.
app.js          Todo o aplicativo. ~3.400 linhas.
style.css       Todo o estilo, com tema claro e escuro por CSS custom properties. ~620 linhas.
sw.js           Service worker, estrategia network-first com fallback no cache.
offline.html    Pagina exibida quando o dispositivo esta sem rede.
manifest.webmanifest
icon-192.png · icon-512.png · icon-512-maskable.png · apple-touch-icon.png
cleanup-planejamento.sql   Migracao que removeu o planejamento. Idempotente, ja rodada.
push-setup.sql             Tabela e RLS das notificacoes push. Idempotente.
supabase/functions/notify-expense/index.ts
                           Edge Function que assina e envia o push. Nao vai pro navegador.
docs/PLANO_V2.md           Historico da v2. Desatualizado, mantido por registro.
PROJETO.md                 Este documento.
```

Não existe pasta `src`, nem `dist`, nem `node_modules`. O que está no repositório é
exatamente o que o navegador baixa — com **uma exceção**: `supabase/functions/` é código
Deno que roda no Supabase, publicado pela CLI, nunca servido pelo GitHub Pages. O app em
si continua sem build.

---

## 2. Diretrizes obrigatórias

Regras que valem para qualquer alteração no projeto. Quebrar qualquer uma delas causa
problema real em produção.

### 2.1 Cache-busting — a mais importante

O service worker guarda os arquivos. Mudar `app.js` ou `style.css` **sem subir a versão
faz o usuário continuar com o arquivo velho**, às vezes por dias. Toda alteração nesses
dois arquivos exige, **no mesmo commit**, quatro edições:

| Arquivo | O que mudar |
|---|---|
| `app.js` | `const APP_VERSION = 'N';` (linha 47) |
| `index.html` | `style.css?v=N` e `app.js?v=N` |
| `sw.js` | `const CACHE = 'gastocerto-vN-descricao';` |
| `sw.js` | os dois `?v=N` dentro de `SHELL` |

A versão aparece no rodapé de **Sua conta**. É por ali que se confere se o deploy chegou
no aparelho.

### 2.2 Sem comentários no código

Nenhum arquivo do projeto leva comentário — nem `//`, nem `/* */`, nem `<!-- -->`. Vale
para `app.js`, `style.css` e `index.html`. Arquivos `.sql` são a exceção.

### 2.3 Git

- Commit e push **direto na `main`**, sempre que uma mudança estiver pronta e verificada.
- **Nunca abrir PR.** O push é o deploy.
- Mensagem em português, **sem acento** (o terminal quebra acentuação em heredoc),
  explicando o *porquê* da mudança, não só o quê.

### 2.4 SQL

Query curta (um `alter`, uma correção pontual, um diagnóstico) vai **no chat**, em bloco
de código. Não vira arquivo no repositório. Só cria arquivo `.sql` quando for um setup
completo ou algo que será reusado.

### 2.5 Layout

- **Nunca pode haver scroll lateral no celular.** É o defeito mais reincidente do projeto.
- A barra de navegação inferior fica em **fluxo normal**, nunca `position: fixed`. Ela é o
  termômetro: se ela está colada no fundo, a altura está certa.
- A altura da viewport é **medida por JavaScript** (`fitViewport()`), não por `100vh`. Ver
  [seção 9.1](#91-a-altura-da-tela-no-pwa-do-iphone).
- Toda cor sai de custom property. Nada de cor literal fora do `:root`.
- Todo ícone é Font Awesome. **Emoji como ícone é proibido.**

### 2.6 Verificação

Mudança visível no navegador se verifica no navegador antes do commit — não só
`node --check`. Testar em 375px (iPhone padrão) e conferir que o console está limpo.

---

## 3. Modelo de dados

Todas as tabelas ficam no schema `public`, todas com RLS ligada, todas com `user_id`
apontando para `auth.users(id)`.

### 3.1 Núcleo

#### `categories`
O centro do app. Uma categoria é um teto mensal com nome.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | text | Gerado no cliente por `uid()`, **não é uuid do banco** |
| `user_id` | uuid | Dono |
| `name` | text | |
| `budget` | numeric | Teto mensal padrão. `0` quando `no_limit` |
| `position` | int | Ordem na lista, reordenável por arrastar |
| `month_budgets` | jsonb | `{"2026-09": 1500}` — teto ajustado de um mês específico |
| `rollover_positive` | bool | Levar a sobra para o mês seguinte |
| `rollover_negative` | bool | Levar o estouro para o mês seguinte |
| `rollover_from` | text | Mês a partir do qual o acúmulo vale (`YYYY-MM`) |
| `no_limit` | bool | **Sem teto**: só acompanha gasto, sem orçamento |

`month_budgets` **mora na categoria de propósito.** Antes ficava em `months.budgets`, mas a
linha de `months` é por usuário — o ajuste não aparecia para quem recebeu a categoria
compartilhada. `baseBudget()` ainda lê `months.budgets` como fallback do legado.

#### `expenses`
| Coluna | Tipo | Observação |
|---|---|---|
| `id` | text | `uid()` do cliente |
| `user_id` | uuid | Quem lançou (pode diferir do dono da categoria) |
| `cat_id` | text | aponta para `categories.id` |
| `month_key` | text | aponta para `months.key`. **É esta coluna que decide o mês do gasto**, não `date` |
| `name` | text | |
| `value` | numeric | |
| `date` | date | Data da compra |
| `recurring` | bool | Repete todo mês |
| `image_url` | text | **Data URI base64 do comprovante, guardado na própria coluna** |
| `installment_total` | int | Total de parcelas |
| `installment_no` | int | Qual parcela é esta |
| `installment_group` | text | Liga as parcelas de uma mesma compra |
| `card_id` | uuid | aponta para `cards.id` |

`month_key` e `date` podem apontar para meses diferentes. É proposital: compra de 19/ago
num cartão que fecha dia 3 entra na fatura de setembro.

#### `months`
| Coluna | Observação |
|---|---|
| `key` | `YYYY-MM` |
| `user_id` | **Linha por usuário** — dois usuários têm linhas distintas do mesmo mês |
| `closed` | Mês encerrado |
| `budgets` | jsonb, **legado**. Substituído por `categories.month_budgets` |

`expenses.month_key` tem chave estrangeira para cá. **A linha do mês precisa existir antes
de inserir o gasto** — é o que `ensureMonthsExist()` garante.

#### `cards`
`id` (uuid), `user_id`, `name`, `closing_day` (1–31), `due_day`. O dia de fechamento
determina em qual fatura a compra cai (`cardInvoiceMonth()`).

**RLS**: além do `user_id = auth.uid()` padrão, tem a política de leitura
`cards_shared_read`, que deixa os dois lados de uma categoria compartilhada lerem o cartão
um do outro — ver [seção 9.6](#96-o-cartão-do-outro-numa-categoria-compartilhada). Sem
ela o app não tem como mostrar em qual cartão o parceiro lançou.

#### `budget_rollovers`
Saldo levado de um mês para o outro. `id`, `user_id`, `cat_id`, `from_month`, `to_month`,
`amount` (negativo quando é estouro), `auto` (bool — distingue automático de manual),
`created_at`.

#### `budget_transfers`
Pedaço de limite movido entre categorias dentro do mês. `user_id`, `month_key`,
`from_cat_id`, `to_cat_id`, `amount`, `created_at`.

#### `push_subscriptions`
Uma linha **por aparelho**: `user_id`, `endpoint` (único), `p256dh`, `auth`, `user_agent`,
`created_at`. A mesma pessoa no iPhone e no desktop tem duas linhas. RLS `ps_own`
(`user_id = auth.uid()`); a Edge Function lê com a `service_role`, que passa por cima.
Inscrição morta (HTTP 404 ou 410 ao enviar) é apagada sozinha pela função.

#### `activity_log`
Histórico por categoria. `category_id`, `actor_user_id`, `actor_email`, `action`
(`create` · `edit` · `delete` · `cat_create` · `cat_edit`), `expense_name`, `value`,
`created_at`.

### 3.2 Contas e planos

#### `profiles`
`id` (igual a `auth.users.id`), `username` (único, minúsculo), `email`. É o `@usuário` pelo
qual as pessoas se encontram.

#### `subscriptions`
`subscription_status` (`trialing` · `active` · outro), `billing_cycle`
(`monthly` · `annual` · `lifetime`), `trial_ends_at`, `current_period_end`.
`resolveUserPlan()` resolve o plano por timestamp.

#### `admin_grants`
Pro concedido na mão. `email`, `plan`, `granted_by`. Uma linha aqui vale mais que a
assinatura. O painel só abre para `2rafab@gmail.com` (constante no código).

### 3.3 Compartilhamento e social

#### `category_shares`
`category_id`, `shared_by_user_id`, `shared_with_email`, `shared_with_user_id`,
`permission` (`view` · `edit`), `status` (`pending` · `accepted`).

#### `friends`
`user_id`, `friend_user_id`, `email`, `username`. A amizade é **recíproca**: adicionar
alguém cria a linha dos dois lados, via RPC.

#### `dm_entries`
Chat 1 a 1 entre amigos. `sender_id`, `recipient_id`, `type`
(`message` · `expense` · `payment`), `text`, `amount`, demais campos da divisão,
`created_at`.

#### Divisão em grupo
`split_groups` (`name`, `created_by`) · `split_members` (`group_id`, `email`, `status`) ·
`split_expenses` (`group_id`, `paid_by_user_id`, valor, descrição) · `split_shares`
(`expense_id`, `member_id`, `amount`, `is_settled`, `settled_at`) · `split_payments`.

### 3.4 Funções (RPC)

| Função | Para quê |
|---|---|
| `friend_lookup(identifier)` | Acha usuário por `@username` ou e-mail sem expor a tabela inteira |
| `ensure_reverse_friend(target_id, my_email, my_username)` | Cria a amizade do outro lado |

### 3.5 RLS

Todas as tabelas têm RLS. O padrão é `user_id = auth.uid()` em `for all`. Duas tabelas têm
política extra de leitura para quem recebeu a categoria compartilhada — sem elas, o saldo
levado e a transferência só apareciam para o dono:

- `budget_rollovers` — `br_own` (tudo do dono) + `br_shared_read` (leitura do convidado)
- `budget_transfers` — `bt_own` + `bt_shared_read`

O SQL completo está em `cleanup-planejamento.sql`, seção 2.

> `create policy` **não aceita** `if not exists`. Sempre `drop policy if exists` antes.

---

## 4. Como o app está montado

### 4.1 Arranque

```
index.html
  script inline: tema, classe gc-has-session, classe gc-quick, medida inicial da altura
app.js
  bootstrapAuth()      le a sessao do localStorage, renova o token
    enterApp()         esconde o login, aplica tema e plano salvos em user_metadata
      init()           carrega tudo do Supabase, aplica rollover, renderiza
```

`init()` renderiza duas vezes quando há cache: uma instantânea com o que está em
`localStorage`, outra quando a rede responde.

### 4.2 Chaves em `localStorage`

| Chave | Conteúdo |
|---|---|
| `gc-auth-session-v2` | Sessão do Supabase, com o refresh token |
| `gc-cache-v2:<user_id>` | Categorias, meses, gastos e nomes, para render instantâneo |
| `gc-theme` | `light` ou `dark` |
| `gc-tutorial-v2` | Tutorial já visto |
| `gc-dm-seen` | Marcação de leitura por amigo |
| `gc-planning` | **Resíduo do planejamento removido.** Pode apagar |

O tema e o "tutorial já visto" também vão para o `user_metadata` do Supabase, para
acompanhar o usuário entre aparelhos.

### 4.3 Camada de acesso

Tudo passa por `sbFetch(path, opts)`, que:
1. garante sessão válida (renova se faltar menos de 2 min para expirar);
2. chama `SUPABASE_URL/rest/v1/<path>` com `apikey` e `Authorization: Bearer`;
3. em `401`, renova o token e repete uma vez;
4. lança o texto do erro quando não é `ok`.

O objeto `api` logo abaixo concentra **todas** as chamadas. Para saber que tabelas e
colunas existem, é ele a fonte da verdade.

### 4.4 Funções que valem conhecer

| Função | Papel |
|---|---|
| `fitViewport()` | Mede a altura real e aplica em `html`, `body`, `#app` e overlays |
| `baseBudget(cat, mes)` | Teto do mês: `month_budgets`, depois `months.budgets`, depois `budget` |
| `effBudget(cat, mes)` | `baseBudget` mais o saldo levado do mês anterior |
| `semTeto(cat)` | Categoria marcada como sem limite |
| `ensureMonthsExist(de, ate)` | Cria as linhas de `months` antes de inserir gastos |
| `cardInvoiceMonth(card, data)` | Em qual fatura a compra cai |
| `loadCards()` | Carrega `allCards` (tudo que dá para ver) e deriva `cards` (só os meus) |
| `cardById(id)` | Procura em `allCards`, então acha o cartão do parceiro também |
| `openCardInfo(expId)` | Sheet com cartão, fechamento, vencimento e fatura do lançamento |
| `parseNum(s)` | Aceita `45,90`, `1.200,00` e `1200.00` |
| `moneyKey(input)` | Máscara de digitação de valor |
| `todayLocal()` | Data de hoje no fuso local — **nunca `toISOString()`** |
| `applyAutoRollover()` | Leva sobras e estouros marcados, a partir de `rollover_from` |
| `parseQuickLink()` e `runQuickAdd()` | Lançamento rápido pelo link `#add` |
| `navMonths()` e `neighborMonth()` | Meses navegáveis e o vizinho de um mês no seletor |
| `goToMonth(mês)` | Troca o mês exibido sem fechar o modal; `selectMonth()` fecha e chama ela |

---

## 5. O que está no ar

### Controle pessoal
- Categorias com teto mensal, reordenáveis por arrastar, com orçamento total no topo.
- **Categoria sem teto** — só acompanha gasto, sem orçamento e sem alerta de estouro; fica
  fora do total orçado, do rollover, da transferência e do ajuste do mês.
- Lançamento com valor em vírgula, data, descrição com autocompletar e comprovante em foto.
- **Gasto recorrente** — repete todo mês automaticamente.
- **Cartão e parcelas** — cartão cadastrado com dia de fechamento; ao escolher "Cartão" o
  app pergunta qual é; com um cartão escolhido a fatura é calculada sozinha, sem o
  "Cai já neste mês". Parcela atual e total são dois campos que se arrasta na horizontal,
  com resumo ao vivo de quantas cobranças serão lançadas e de quanto.
- **Ajuste do orçamento do mês** — muda o teto só daquele mês.
- **Transferência de limite** entre categorias, válida só no mês corrente.
- **Rollover** — levar a sobra e/ou o estouro para o mês seguinte, automático. Vale a
  partir do mês seguinte ao que foi ligado; ao desligar, o app pergunta o que fazer com o
  que já foi levado.
- Previsão de quando o saldo acaba, no ritmo atual de gasto.
- Navegação entre meses por **passo a passo**: próximo, atual e anterior empilhados, com
  seta para cima e para baixo. Ver [seção 5.2](#52-o-seletor-de-mês-v510).
  **O app sempre abre no mês atual.**
- **Próximos meses** — saldo mês a mês do que já está comprometido. Ver
  [seção 5.1](#51-próximos-meses-v59).
- Histórico com média diária, projeção, variação, distribuição por categoria, evolução por
  mês e consolidado.
- Exportar a categoria como imagem pronta para compartilhar.

### Social
- Compartilhar categoria por `@usuário` ou e-mail, com permissão de leitura ou edição. O
  cartão usado pelo parceiro aparece no lançamento e abre com os dados da fatura, mas
  **não dá para trocar** — ver [seção 9.6](#96-o-cartão-do-outro-numa-categoria-compartilhada).
- Amigos com amizade recíproca automática e chat 1 a 1.
- Divisão de despesa no chat: 50/50 ou personalizada, com saldo e extrato.
- Divisão em grupo para três ou mais pessoas, com acerto de contas.
- **Notificação push com o app fechado** quando alguém lança numa categoria compartilhada.
  Ver [seção 11](#11-notificações-push).
- Notificação no navegador quando chega mensagem, com o app aberto.

### 5.1 Próximos meses (v5.9)

Responde a uma pergunta só: **quanto sobra do orçamento nos meses que vêm, considerando o
que já está comprometido.** Não inventa receita, não projeta ritmo de gasto, não pede nada
ao usuário — lê o que já está lançado.

Abre por dois caminhos: o seletor de meses (botão *Ver o saldo dos próximos meses*) e o
card de resumo do **Histórico**. É recurso Pro, como o resto do histórico.

**O que entra na conta de um mês futuro:**

| Origem | De onde vem |
|---|---|
| Parcelas de cartão | Linhas reais em `expenses`. `saveExpense()` já grava **todas** as parcelas no ato da compra, uma por `month_key` |
| Lançamentos jogados para frente | Linhas reais em `expenses` com `month_key` à frente |
| Gastos recorrentes | **Projetados, não existem no banco.** `autoCreateRecurring()` só materializa o mês corrente |
| Orçamento | `baseBudget(cat, mês)` — respeita `month_budgets` do mês |

A projeção de recorrente é a única parte sintética. `projectedFor(mês)` repete cada
recorrente do mês corrente (`recurringBase`) nos meses seguintes, **pulando** os que já têm
linha real com mesma categoria e mesmo nome, para não contar duas vezes. Esses itens
carregam `previsto:true`, aparecem com a etiqueta *previsto* e **não têm botão de editar
nem de excluir** — não existem para apagar.

Categoria **sem teto** fica fora do saldo (ela não tem orçamento) e aparece numa linha à
parte, igual ao resto do app.

O saldo usa `baseBudget`, não `effBudget`: o rollover de um mês futuro ainda não aconteceu
e não dá para contar com ele.

**Funções:**

| Função | Papel |
|---|---|
| `api.getExpensesFrom(mk)` | Uma query só, `month_key=gte`, **sem `image_url`** (é base64, não pode vir) |
| `refreshFutureMonths()` | Preenche `futureExpenses`, `recurringBase` e `futureMonthKeys` |
| `projectedFor(mês)` | Recorrentes projetados naquele mês |
| `syncProjected()` | Atualiza `projectedExpenses` quando `viewMonthKey` muda |
| `futureMonthData(mês)` | `{itens, comprometido, semOrcamento, orcamento, resta}` |
| `futurePlan(n)` | Os `n` próximos meses (padrão 12) |
| `openFuturo()` | A tela |

**Navegando para um mês futuro**, a home mostra as parcelas reais **mais** os recorrentes
projetados, porque `buildSlide()` soma `expenses` e `projectedExpenses`. O rótulo do herói
muda para *Deve sobrar* / *Vai estourar*.

### 5.2 O seletor de mês (v5.10)

A pílula do mês, no cabeçalho, abre um **passo a passo** de três linhas:

```
        [ ▲ ]
  Out 2026    Próximo · R$ 1983,33 · 2 lançamentos
  Set 2026    Este mês · R$ 1110,00 · 2 lançamentos     <- o que você está vendo
  Ago 2026    Anterior · R$ 1140,00 · 2 lançamentos
        [ ▼ ]
```

A seta — ou a própria linha de cima/de baixo — **navega na hora**, e o passo a passo se
redesenha em volta do novo mês. Para cima é futuro, para baixo é passado. Quando não há
para onde ir a seta fica desabilitada e a linha vira *fim da linha*.

**Só entram meses que têm lançamento**, mais o mês corrente, que está sempre disponível.
Meses vazios são pulados: de Jul 2026 a seta para baixo vai direto para Mai 2026 se Jun
estiver vazio. Quem decide isso é `navMonths()`, a lista ordenada de meses navegáveis;
`neighborMonth(chave, ±1)` é só o vizinho nessa lista.

O botão **Escolher outro mês** troca o conteúdo do mesmo sheet por uma grade de pastilhas,
um ano por bloco, quatro colunas. Pastilha com fundo verde-claro tem lançamento e é
clicável; pastilha apagada está vazia e não clica. O mês que você está vendo fica sólido e
o mês corrente ganha um anel. A grade vai do primeiro ao último mês com lançamento — não
existe ano inteiro em branco.

O índice que alimenta tudo isso é `monthIndex`, `{mês: {total, count}}`, montado por
`refreshMonthIndex()` a partir de `api.getMonthTotals()` — uma query de duas colunas
(`month_key`, `value`) sobre `expenses`. É recarregado no boot, ao salvar e ao excluir
lançamento.

> **Não voltar a listar todos os meses futuros numa lista corrida.** Foi tentado na v5.7 e
> poluiu: uma compra em 10x rendia nove linhas idênticas de "1 lançamento". O passo a passo
> e a grade existem exatamente para resolver isso.

### Plataforma
- PWA instalável, funciona offline com os dados em cache.
- Tema claro e escuro, sincronizado entre aparelhos.
- Trial de 14 dias; no plano gratuito, 3 lançamentos por dia e 2 categorias.
- Tela de PIN (o PIN é o ano corrente — proteção fraca, de conveniência).
- Tutorial em 11 passos com destaque nos elementos.
- **Lançamento rápido por link** (`#add?v=45,90&n=Padaria&cat=Mercado&card=Nubank&p=3`) —
  abre o formulário preenchido, para atalhos do iOS. Ver [seção 7](#7-lançamento-rápido-ios).
- **View de desktop** acima de 900px: largura até 1180px e categorias lado a lado em grade.

---

## 6. Limites conhecidos

| | |
|---|---|
| Comprovante | Guardado como data URI base64 **dentro da coluna**, não em Storage. Infla a tabela `expenses` e o cache local. Migrar para Storage é a melhoria mais óbvia pendente |
| PIN | É o ano corrente. Não é segurança, é conveniência |
| Valores | `brl()` não põe separador de milhar: mostra `R$ 1200,00` |
| `incomes` | A tabela foi removida, mas `api.getIncomes` e as três irmãs continuam em `app.js` como código morto |
| `gc-planning` | Chave de `localStorage` que sobrou do planejamento |
| Widget e leitura de notificação | Impossíveis em PWA. Ver [seção 7](#7-lançamento-rápido-ios) |
| Push no Safari em aba (iPhone) | Só funciona no PWA instalado na tela de início. Ver [seção 11](#11-notificações-push) |
| Sem testes | Nenhum teste automatizado. Verificação é manual, no navegador |

---

## 7. Lançamento rápido (iOS)

O app entende `#add` no fim da URL e abre o formulário de gasto já preenchido.

| Parâmetro | O quê |
|---|---|
| `v` | Valor — aceita `45,90`, `1.200,00` e até `R$ 45,90` |
| `n` | Descrição |
| `cat` | Nome da categoria, sem diferenciar maiúscula nem acento |
| `card` | Nome do cartão — já entra em modo Cartão |
| `p` | Total de parcelas |
| `d` | Data, `2026-08-19` |

**Nada é gravado sozinho.** Abre preenchido e a pessoa escolhe categoria, cartão e parcelas
antes de salvar. Sem sessão, não abre nada: mostra a tela de login com um aviso e descarta
o payload. O hash sai da URL logo no boot, para um reload não reabrir o formulário. Funciona
tanto no carregamento quanto por `hashchange`, porque o Safari reaproveita a aba aberta.

O passo a passo para montar o atalho está dentro do app, em
**Sua conta › Lançamento rápido (iOS)**.

### O que não dá para fazer

- **Ler a notificação do banco** — API só existe no Android nativo. No iPhone não existe nem
  para app nativo.
- **Widget com dados na tela de início** — exige WidgetKit, ou seja, app nativo.
- **Abrir dentro do PWA instalado** — o iOS não roteia link para web app de tela de início.
  O atalho sempre abre no **Safari**, que tem sessão própria: é preciso logar uma vez lá.
- **Disparar na compra** — a automação de Transação dos Atalhos só enxerga o que passou pelo
  Apple Pay no aparelho. Cartão físico, site e PIX não disparam.

---

## 8. O que foi abandonado

### Módulo de Planejamento futuro — removido na v5.1

> A v5.9 trouxe **Próximos meses**, que não é a volta disso. Aquele módulo pedia receita,
> âncoras de saldo e importação de planilha. Este só soma o que já está lançado e compara
> com o teto das categorias — zero dado novo, zero tela de cadastro.

Entre as v3.15 e v5.0 foi construído um módulo completo de projeção: saldo mês a mês,
compromissos futuros, âncoras de saldo, extrato com saldo correndo, tabela no formato de
planilha, e um importador que leu 41 meses de uma planilha do Google Sheets. Chegou a ser
validado contra os números da própria planilha.

**Foi removido inteiro — 1.119 linhas.** Decisão do dono do projeto:

> "é uma função muito complexa para um aplicativo, é naturalmente melhor lidar com isso em
> planilha e ver via desktop"

**Não propor de novo** projeção de saldo, compromissos futuros ou importação de planilha.

Tabelas apagadas: `plan_entries`, `balance_anchors`, `planned_items`, `incomes`,
`finance_settings`. Colunas apagadas: `categories.plan_defer`, `.show_home`, `.show_plan`,
`.group_name`; `expenses.plan_entry_id`, `.planned_item_id`, `.paid`, `.notes`.

**O que ficou dessa era e deve ser preservado:** rollover, transferência entre categorias,
cartões com dia de fechamento, parcelas, recorrentes, comprovantes e
`categories.month_budgets`.

### Outras tentativas descartadas

| O quê | Por quê |
|---|---|
| Nav inferior `position: fixed` | Flutuava no PWA do iPhone. Voltou para fluxo normal com altura medida por JS |
| Nav no topo ou lateral | Testado quando o rodapé não colava; o dono preferiu o rodapé |
| `100vh` e `-webkit-fill-available` | Nenhum dos dois dá a altura real no PWA standalone |
| Navegar para qualquer mês futuro por lista corrida (v5.7) | Poluía o seletor. Virou passo a passo de 3 linhas mais grade de pastilhas (v5.10) |
| Campo de código de barras no gasto | Pertencia ao planejamento; saiu junto |
| Emoji como ícone | Trocado por Font Awesome em todo o app |

---

## 9. Armadilhas que já custaram caro

### 9.1 A altura da tela no PWA do iPhone

No modo standalone o iOS não entrega a altura real por `100vh`, `-webkit-fill-available`
nem `innerHeight` sozinho. A solução em produção é `fitViewport()`, que pega o **maior**
entre `innerHeight`, `clientHeight`, `visualViewport.height` e — só quando standalone —
`screen.height`, e aplica esse número **inline** em `html`, `body`, `#app` e em todos os
overlays. É chamada no load, no resize, na mudança de orientação, no `pageshow` e em três
timeouts (150 ms, 500 ms, 1200 ms).

**Não trocar por CSS.** Já foi tentado várias vezes e não funciona.

### 9.2 Fuso horário

`new Date().toISOString().split('T')[0]` devolve **o dia seguinte** depois das 21h em
UTC−3. Lançamentos caíam no dia errado à noite. Use sempre `todayLocal()`.

### 9.3 Chave estrangeira de `months`

`expenses.month_key` referencia `months`, e a linha de `months` é **por usuário**. Inserir
gasto num mês que ainda não existe dá `Key is not present in table "months"`.
`ensureMonthsExist()` tem que rodar **antes** de qualquer insert, cobrindo todo o intervalo
das parcelas.

### 9.4 Orçamento de categoria compartilhada

Ajuste e transferência gravados em `months.budgets` não apareciam para o convidado, porque
a linha de `months` é por usuário. Por isso o valor do mês mora em
`categories.month_budgets`. **Nunca voltar a gravar em `months.budgets`.**

### 9.5 Colisão de classe CSS

`.plan-card` já existia no paywall e colidiu com cards novos de mesmo nome. Antes de criar
classe, conferir se o nome já existe em `style.css`.

### 9.6 O cartão do outro numa categoria compartilhada

Um lançamento feito pelo parceiro aponta para um cartão **dele**. `api.getCards()` filtra
`user_id = eq.<eu>`, e a RLS padrão de `cards` é `user_id = auth.uid()` — então o cartão
não vinha, `cardLabel()` devolvia `null` e **o cartão simplesmente não aparecia**, nem na
lista nem no formulário. Foi o defeito corrigido na v5.11.

São duas metades, e uma não funciona sem a outra:

**No banco**, a política de leitura que libera os dois lados:

```sql
drop policy if exists cards_shared_read on cards;
create policy cards_shared_read on cards for select using (
  user_id = auth.uid()
  or user_id in (select shared_by_user_id from category_shares
                 where status = 'accepted'
                   and (shared_with_user_id = auth.uid()
                        or shared_with_email = auth.jwt()->>'email'))
  or user_id in (select shared_with_user_id from category_shares
                 where status = 'accepted' and shared_by_user_id = auth.uid())
);
```

As políticas são somadas com `or`, então essa convive com a que já existe. As subconsultas
rodam como o usuário corrente e passam pela RLS de `category_shares`, que já permite os
dois lados enxergarem a linha do compartilhamento.

**No app**, `cards` passou a ser só a lista dos **meus** cartões — é ela que alimenta o
seletor, o cadastro e a remoção — e `allCards` guarda tudo o que a RLS deixa ler.
`cardById()` procura em `allCards`, e é ele que `cardLabel()` e `selectedCard()` usam.

O cartão de outra pessoa é **somente leitura**:

- na lista, a etiqueta do cartão abre `openCardInfo()` com fechamento, vencimento, data da
  compra, fatura e parcela — funciona mesmo na categoria com permissão de só leitura, onde
  não existe botão de editar;
- no formulário, a linha do cartão vira `div` com `data-locked` e cadeado no lugar da seta,
  não abre o seletor e não dispara a pergunta automática de cartão. O `card_id` continua no
  input escondido, então salvar preserva o cartão original.

Trava quando o lançamento é de outra pessoa **ou** quando o cartão é comprovadamente de
outro dono. Cartão apagado ou desconhecido num lançamento meu **não** trava — senão a
remoção de cartão deixaria o lançamento preso.

Sem a política no banco o app não quebra: some a etiqueta e o formulário mostra *Cartão de
outra pessoa · sem acesso aos dados deste cartão*, ainda travado.

### 9.7 Remover CSS em bloco

Ao apagar um trecho grande de CSS é fácil levar junto a chave de fechamento de um
`@media`, o que engole silenciosamente todas as regras seguintes. Confira que o número de
chaves abertas é igual ao de fechadas:

```bash
python -c "import io;s=io.open('style.css',encoding='utf-8').read();print(s.count('{'),s.count('}'))"
```

---

## 10. Migrar para outra conta

Duas coisas independentes: o **repositório** (fácil) e o **Supabase** (onde mora o risco).

### 10.1 A regra que manda em tudo

Todas as tabelas têm `user_id` apontando para `auth.users(id)`. **Se os UUIDs dos usuários
mudarem, todos os dados órfanam.** A migração precisa preservar as linhas de `auth.users`
com o mesmo `id`. Levar `encrypted_password` junto faz as pessoas continuarem entrando com
a senha de sempre.

Não tente recriar os usuários e depois "amarrar" os dados. Migre `auth.users` primeiro,
com os ids originais.

### 10.2 Repositório

```bash
git clone --mirror https://github.com/2rafams-svg/gastocerto.git
```

```bash
cd gastocerto.git && git push --mirror https://github.com/ORG-NOVA/REPO-NOVO.git
```

No repositório novo: **Settings › Pages › Source: Deploy from a branch › `main` › `/`**.

A URL muda, e com ela:
- o link do lançamento rápido (o app monta sozinho a partir de `location`, mas **os atalhos
  já criados no iPhone precisam ser atualizados na mão**);
- o PWA instalado no aparelho aponta para o domínio antigo. Todo mundo precisa reinstalar.

### 10.3 Supabase — caminho recomendado

Crie o projeto novo na conta nova. Depois, com a CLI do Supabase instalada e as duas
connection strings em mãos (Dashboard › Settings › Database › Connection string › URI):

```bash
export ANTIGO="postgresql://postgres:SENHA@db.asnuusgwtsjpwuaakfuc.supabase.co:5432/postgres"
```

```bash
export NOVO="postgresql://postgres:SENHA@db.NOVO-REF.supabase.co:5432/postgres"
```

```bash
supabase db dump --db-url "$ANTIGO" -f papeis.sql --role-only && supabase db dump --db-url "$ANTIGO" -f schema.sql && supabase db dump --db-url "$ANTIGO" -f dados.sql --data-only --use-copy
```

Restaure **nesta ordem** — papéis, estrutura, dados:

```bash
psql "$NOVO" -f papeis.sql && psql "$NOVO" -f schema.sql && psql "$NOVO" -f dados.sql
```

Depois **confira que os usuários vieram**, antes de qualquer outra coisa:

```sql
select count(*) from auth.users;
select id, email, email_confirmed_at from auth.users order by created_at limit 10;
```

Se `auth.users` vier vazio, o dump não pegou o schema `auth`. Repita o dump de dados
apontando os schemas explicitamente:

```bash
supabase db dump --db-url "$ANTIGO" -f dados.sql --data-only --use-copy --schema public,auth,storage
```

### 10.4 Supabase — caminho manual, se o dump falhar

O volume de dados é pequeno; dá para fazer tabela a tabela. A **ordem importa** por causa
das chaves estrangeiras:

```
1. auth.users                          (com os ids originais)
2. profiles · subscriptions · admin_grants
3. categories · months · cards
4. expenses                            (depende de categories, months e cards)
5. budget_rollovers · budget_transfers · activity_log
6. category_shares · friends · dm_entries
7. split_groups · split_members · split_expenses · split_shares · split_payments
```

Para exportar cada tabela em CSV pelo SQL Editor, rode e use o botão de download:

```sql
select * from categories order by user_id, position;
```

Cuidado com `expenses.image_url`: são data URIs base64 de vários KB cada. CSV com esse
campo fica enorme e quebra fácil em editor de planilha. Se for por CSV, exporte
`expenses` sem a coluna e traga os comprovantes num segundo passo — ou aceite perdê-los.

### 10.5 Estrutura mínima, se for recriar do zero

Quem preferir recriar o schema na mão tem duas fontes para não esquecer nada:

1. **O objeto `api` em `app.js`** — lista toda tabela e todo campo que o app usa.
2. **`cleanup-planejamento.sql`** — traz as políticas de RLS de `budget_rollovers` e
   `budget_transfers`, que são as não óbvias.

Não esqueça, porque o app quebra sem: RLS ligada em todas as tabelas, as duas funções RPC
(`friend_lookup` e `ensure_reverse_friend`), e a trigger que cria `profiles` e
`subscriptions` quando um usuário novo se cadastra.

### 10.6 Apontar o app para o projeto novo

Em `app.js`, linhas 48 e 49:

```js
const SUPABASE_URL = 'https://NOVO-REF.supabase.co';
const SUPABASE_KEY = 'CHAVE_PUBLISHABLE_NOVA';
```

A chave é a **publishable / anon**, que é pública por natureza — vai no código do cliente e
qualquer pessoa consegue lê-la. Quem protege os dados é a RLS, não a chave. **Nunca** ponha
a `service_role` aqui.

Suba a versão junto ([seção 2.1](#21-cache-busting--a-mais-importante)), senão o service
worker continua servindo o `app.js` velho, apontado para o banco antigo.

### 10.7 Conferência depois de migrar

- [ ] `select count(*) from auth.users` bate com o projeto antigo
- [ ] Login funciona com a senha de sempre
- [ ] As categorias aparecem, com os orçamentos certos
- [ ] Os gastos do mês corrente aparecem
- [ ] Uma categoria compartilhada continua visível para o convidado
- [ ] Um comprovante antigo abre
- [ ] Salvar um gasto novo funciona (prova que RLS e FK estão de pé)
- [ ] Duas contas diferentes não enxergam dados uma da outra
- [ ] O atalho `#add` abre o formulário preenchido

---

## 11. Notificações push

Avisar quem compartilha a categoria quando alguém lança, **com o app fechado**. Ligado na
v5.12.

### 11.1 As três regras do iPhone

| | |
|---|---|
| **Só no app instalado** | Web Push no iOS existe a partir do 16.4 e **apenas** para PWA na tela de início. Safari em aba não recebe nada, e não há contorno |
| **Permissão só por toque** | `Notification.requestPermission()` fora de um gesto do usuário é ignorado. Por isso a permissão virou um botão em **Sua conta**, e não mais uma chamada solta ao abrir o chat |
| **`new Notification()` não existe** | Em PWA no iOS só funciona `registration.showNotification()`. Era o motivo de a notificação de mensagem nunca ter aparecido no iPhone; `showLocalNotification()` resolveu |

No Android e no desktop funciona direto do navegador, sem instalar.

### 11.2 As peças

```
app.js         enablePush() assina e grava em push_subscriptions
push-setup.sql tabela + RLS
Database Webhook   INSERT em expenses  ->  chama a funcao
Edge Function  notify-expense: descobre quem avisar, assina VAPID, envia
sw.js          push -> showNotification · notificationclick -> foca a janela
```

A chave **pública** VAPID está em `app.js` (`VAPID_PUBLIC_KEY`) — é pública por natureza,
igual à chave do Supabase. A **privada** vive só nos secrets do Supabase e **nunca entra no
repositório**.

### 11.3 Quem é avisado

`notify-expense` monta a lista como dono da categoria **mais** todos os
`category_shares` com `status = 'accepted'`, **menos** quem lançou. Quem lançou nunca é
notificado do próprio lançamento.

Compra parcelada gera uma linha por mês, todas no mesmo insert. A função **ignora
`installment_no > 1`**, senão uma compra em 10x dispararia dez notificações de uma vez.

### 11.4 Como publicar

Tudo isto é fora do repositório e só você pode fazer.

**1. Rode o SQL.** `push-setup.sql` inteiro, no SQL Editor.

**2. Instale a CLI e conecte ao projeto:**

```bash
npm i -g supabase && supabase login && supabase link --project-ref asnuusgwtsjpwuaakfuc
```

**3. Guarde as chaves VAPID nos secrets:**

```bash
supabase secrets set VAPID_PUBLIC_KEY=BOGPXr8rzIa2v0x9icJfeWnSp7OEfo5wDjcRV39GFqVuctrVr5k_dfjkpHpi06obd9S5k80T9O5kadH71ITniyY VAPID_PRIVATE_KEY=<a-chave-privada> VAPID_SUBJECT=mailto:2rafab@gmail.com
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas sozinhas, não precisa setar.

**4. Publique a função:**

```bash
supabase functions deploy notify-expense
```

**5. Crie o webhook.** No painel: **Database › Webhooks › Create a new hook**. Tabela
`expenses`, evento **Insert**, tipo **Supabase Edge Functions**, função `notify-expense`,
método POST. No header `Authorization` ponha `Bearer <SERVICE_ROLE_KEY>` — sem isso a
função recusa a chamada.

**6. Instale o app na tela de início** (iPhone: Compartilhar › Adicionar à Tela de Início),
abra por lá, vá em **Sua conta** e ligue a chave de notificações.

### 11.5 Quando não chegar

Nesta ordem, que é da ponta mais provável para a menos:

1. `select count(*) from push_subscriptions;` — se for zero, ninguém se inscreveu: o
   problema está no app ou na permissão, não no envio.
2. Painel do Supabase › **Edge Functions › notify-expense › Logs**. A função devolve
   `{sent, gone, recipients}` ou um `skipped` dizendo por quê parou.
3. `skipped: "ninguém para avisar"` significa que o compartilhamento não está `accepted`,
   ou que só existe você.
4. Se `sent` for maior que zero e mesmo assim nada aparecer no iPhone: quase sempre é o app
   aberto no Safari em aba, e não o instalado.
5. iOS desinscreve sozinho quem fica muito tempo sem abrir. A função apaga a inscrição
   morta (404/410); é só religar a chave em Sua conta.

## 12. Histórico de versões

| Versão | O quê |
|---|---|
| 5.12 | Notificação push com o app fechado quando alguém lança em categoria compartilhada; corrige a notificação local, que nunca funcionou no iPhone |
| 5.11 | Cartão do parceiro aparece no lançamento compartilhado, só leitura, com fechamento e vencimento; pede a política `cards_shared_read` |
| 5.10 | Seletor de mês vira passo a passo (próximo · atual · anterior) com setas, mais grade de pastilhas por ano; só navega para mês com lançamento |
| 5.9 | **Próximos meses**: saldo mês a mês do que já está comprometido; corrige `api.getExpensesFrom`, que não existia e matava a lista de meses futuros |
| 5.8 | Categoria sem teto, view de desktop acima de 900px, seletor de meses revertido |
| 5.7 | Sempre abre no mês atual; pílula do mês destacada fora do mês corrente |
| 5.6 | Atalho passa a funcionar também com a aba já aberta (`hashchange`) |
| 5.5 | Lançamento rápido por link `#add`, para atalhos do iOS |
| 5.4 | UI do cartão refeita: popup de escolha, fatura calculada, parcelas por arrastar |
| 5.3 | Corrige a violação de FK ao lançar em mês que ainda não existia |
| 5.2 | Rollover só vale do mês seguinte; pergunta ao ser desligado |
| 5.1 | **Remove o planejamento**; corrige o orçamento de categoria compartilhada |
| 3.15–5.0 | Módulo de planejamento, construído e depois descartado |
| 3.34 | Nav volta ao rodapé em fluxo normal, com altura medida por JS |
| 2.x | Contas, RLS, planos, compartilhamento de categoria |

`git log --oneline` traz o resto.
