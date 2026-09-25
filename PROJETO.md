# GastoPensado — documento do projeto

Referência única do projeto: o que ele é, como está montado, o que está no ar, o que foi
abandonado, as regras que toda alteração precisa seguir, e o passo a passo para migrar
tudo para outra conta.

Versão do app na data deste documento: **6.2.1** · Última atualização: **25/09/2026**

> Até a v5.19 o app se chamava **GastoCerto**. A v6 trocou o nome e a identidade inteira —
> ver [seção 1.1](#11-identidade-v6).

---

## 1. O que é

PWA de controle de gastos por categoria, em português, focado em celular (iPhone em
especial). Cada categoria tem um teto mensal e o app existe para você respeitar esse teto —
e, desde a v6, para dizer **quanto ainda dá para gastar por dia** até o fim do mês.
Tem ainda um módulo de dividir contas com amigos, separado do controle pessoal.

**Não é** ferramenta de planejamento futuro no sentido de projetar receita e saldo em
conta — isso foi tentado e removido, ver [seção 8](#8-o-que-foi-abandonado). O que existe
desde a v5.9 é uma leitura do que **já está comprometido** para frente, derivada só do que
está lançado: [seção 5.1](#51-próximos-meses-v59).

### 1.1 Identidade (v6)

**Nome**: GastoPensado. Slogan: *Gasto bom é gasto pensado.*

**Logo**: um "p" dentro de um balão de pensamento, com o rastro de bolinhas. Em SVG inline
com duas classes — `.lg-b` (balão, `fill:var(--accent)`) e `.lg-p` (letra,
`stroke:var(--on-accent)`) — então **segue o tema sozinho** e não tem cor literal. Os PNGs
(`icon-192`, `icon-512`, `icon-512-maskable`, `apple-touch-icon`) foram gerados com o
mesmo desenho sobre o gradiente violeta; o maskable usa 52% da área para caber na zona
segura.

**Cor de marca ≠ cor de dinheiro.** Esta é a regra que mais importa na paleta nova:

| Token | Para quê |
|---|---|
| `--accent*` | **A marca** — violeta. Botões, FAB, chip ativo, nav ativa, foco, links |
| `--pos*` | **Dinheiro positivo** — verde. Sobra, "cabe no mês", economizou, saldo a favor |
| `--red*` · `--amber*` | Estouro e alerta, como antes |
| `--spark*` | Coral de destaque. Hoje só no raio do lançamento rápido |
| `--cat-1`…`--cat-8` e `-soft` | Cor de cada categoria (ver abaixo) |

Até a v5 a marca era verde e "positivo" era a mesma cor. Na v6 são duas: **nunca use
`--accent` para sinalizar sobra ou saldo positivo** — use `--pos-text`.

**Cor da categoria** não é guardada: `catTone(cat)` faz um hash do `id` e escolhe um dos 8
tons. Estável, e reordenar não muda a cor.

**Ícone da categoria**: `catIcon(cat)` usa `categories.icon` se existir; senão
`iconePalpite(nome)` adivinha pelo nome (Mercado → carrinho, Pet → pata, Rolê → taças,
Combustível → bomba). Por isso as categorias antigas já nasceram com ícone, sem SQL.

**O que NÃO foi renomeado, de propósito:**

| | Por quê |
|---|---|
| Repositório e URL (`/gastocerto/`) | Mudar a URL quebra o PWA instalado e os atalhos do iPhone. Fica para uma migração planejada |
| Chaves `gc-*` do `localStorage` | Renomear desloga todo mundo e perde tema e cache. `gc-` é só um prefixo interno |
| Nome do cache do SW | Esse **mudou** (`gastopensado-v6.0`) — o `activate` apaga os `gastocerto-*` antigos sozinho |

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
| Fontes | Bricolage Grotesque (títulos e números grandes) + DM Sans (corpo), por Google Fonts |

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
- **Marca é `--accent`, dinheiro positivo é `--pos`.** Nunca troque um pelo outro — ver
  [seção 1.1](#11-identidade-v6).
- Valor em dinheiro na tela leva a classe **`money`**: é ela que o modo discreto embaça.
- Confirmação é sempre `confirmar()` ou `perguntar()`, **nunca `confirm()` nativo**.
- Todo ícone é Font Awesome. **Emoji como ícone é proibido.**
- **Três faixas de largura**, e cada uma é um app diferente:

  | Largura | O que é |
  |---|---|
  | até 699px | Celular: carrossel de categorias, chips, nav embaixo, FAB |
  | 700–1099px | Tablet / janela pequena: faixa horizontal de cards com setas ‹ › |
  | 1100px ou mais | **Sistema web**: sidebar, Painel, análise de categoria, Relatórios. Classe `gp-web` no `<html>` |

  `telaWeb()` e `telaLarga()` são as perguntas em JS; o CSS usa os mesmos números. Mudou
  um, mude o outro.
- O cabeçalho do celular **nunca pode cortar a logo**: o título tem `white-space:nowrap` e
  `font-size:clamp(...)`, o bloco da direita tem `flex-shrink:0`, e abaixo de 520px o selo
  do plano some. Testar em 320, 360, 375, 390 e 430px.

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
| `subcats` | jsonb | `["Preparos","Delivery"]` — tipos dentro da categoria. Vazio esconde o campo no lançamento |
| `icon` | text | Classe Font Awesome escolhida (`fa-paw`). **Opcional**: sem ela o app adivinha pelo nome |

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
| `subcat` | text | Um dos `categories.subcats`. Texto solto de propósito: renomear o tipo não quebra o histórico |
| `lat` · `lng` | numeric | Onde foi. Guardadas para o link do mapa |
| `place` | text | Endereço aproximado, resolvido na hora de salvar. **É o que a tela mostra** — coordenada ninguém lê |

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

#### `budget_loans`
Adiantamento de limite entre meses. `user_id`, `cat_id`, `loan_group`, `month_key`,
`amount`, `created_at`. Um adiantamento é **um grupo de linhas**: uma positiva no mês que
recebe e uma negativa por mês de devolução, todas com o mesmo `loan_group` — desfazer é
apagar o grupo inteiro. Ver [seção 5.3](#53-adiantar-limite-do-mês-seguinte-v514).

#### `budget_transfers`
Pedaço de limite movido entre categorias dentro do mês. `user_id`, `month_key`,
`from_cat_id`, `to_cat_id`, `amount`, `created_at`.

#### `budget_reliefs` (v6.2)
O **alívio**: cashback, reembolso, bônus — dinheiro que volta e aumenta o limite da
categoria no mês. `id` (text, `uid()` do cliente), `user_id`, `relief_group`, `source`
(a fonte, texto solto: "Cashback", "Pontos Livelo"), `name` (descrição opcional),
`cat_id`, `month_key`, `amount` (> 0), `date`, `created_at`.

Um alívio dividido em N categorias é **um grupo de N linhas** com o mesmo
`relief_group`, cada uma com o seu pedaço — a soma fecha exatamente no valor lançado,
em centavos. Desfazer pode apagar o grupo inteiro ou só a linha de uma categoria.

RLS: `brf_read` (quem lançou, o dono da categoria e quem recebeu a categoria),
`brf_insert` (só em categoria própria ou compartilhada com permissão de edição),
`brf_delete` (quem lançou ou o dono da categoria). Sem política de `update`: alívio não
se edita, se desfaz e lança de novo.

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
`id` (igual a `auth.users.id`), `username` (único, minúsculo), `email`, `avatar_url`. É o
`@usuário` pelo qual as pessoas se encontram.

`avatar_url` é a **foto de perfil**: um JPEG de 256×256, recortado no centro, guardado como
data URI (~15–30 KB). Aparece no botão de conta, na tela Sua conta, na lista de amigos e
no topo do chat. **Toda imagem que vem do banco passa por `imgSegura()`** antes de ir para
um `src`: só aceita `data:image/(jpeg|png|webp|gif);base64,...`. Sem isso, um `avatar_url`
com aspas quebraria o atributo e rodaria script na tela de quem é amigo daquela pessoa. A
mesma trava vale para os comprovantes.

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
- `budget_loans` — `bl_shared_read` (desde a v6.1.1; antes o adiantamento só existia para o
  dono e o limite da categoria compartilhada ficava diferente para cada um)

As três políticas de leitura aceitam o convidado por `shared_with_user_id` **ou** por
`shared_with_email`, igual à `cards_shared_read`.

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
| `gc-dm-seen` | Marcação de leitura por amigo. **Espelhada em `user_metadata.dm_seen`**, senão o aparelho que não abriu a conversa mostra "não lida" para sempre |
| `gc-planning` | **Resíduo do planejamento removido.** Pode apagar |
| `gp-discreto` | Modo discreto ligado (`1`). Aplicado já na primeira linha do `app.js`, antes do render, para não piscar valor |
| `gp-web-layout` | `{ordem:[ids], ocultas:[ids]}` — ordem e categorias escondidas **só no Painel web**. Não toca em `categories.position`, então o celular continua igual |
| `gp-bi` | Período, agrupamento, categoria e ordenação dos Relatórios. Busca e grupo aberto não são guardados |
| `gp-local-auto` | `0` desliga a busca automática do local. Ausente ou `1`, o app busca ao abrir o lançamento. Fica **por aparelho**, porque a permissão de GPS também é |

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
| `brl(v)` | `R$ 1.234,56` — `Intl.NumberFormat('pt-BR')`, com milhar desde a v6 |
| `perguntar({titulo,texto,opcoes})` | Diálogo próprio com N botões; devolve o `valor` do escolhido ou `null` |
| `confirmar(texto,{titulo,botao,perigo})` | Atalho de `perguntar` para sim/não; devolve `true`/`false` |
| `expenseFormHtml(e, cat)` | **O único formulário de gasto.** Novo e edição usam o mesmo |
| `posAbrirForm(e)` | Sincroniza chips, tipo, atalhos, data e resumo depois de abrir o formulário |
| `atalhosDe(catId)` e `valorTipico(nome,cat)` | "Seus de sempre": nomes repetidos da categoria e o valor mais frequente |
| `catIcon`, `catTone`, `catBadge`, `iconePalpite` | Ícone e cor de categoria |
| `ritmoDoMes(gasto, disponível)` | Quanto dá por dia e se o ritmo atual cabe no mês |
| `openCatOptions(catId)` | O menu ⋯ do card |
| `openExpenseDetail(expId)` | Ficha de só leitura (gasto de categoria compartilhada ou previsto) |
| `toggleDiscreto()` | Liga e desliga o modo discreto |
| `valoresProntos()` | Tira o `gp-carregando` do `<html>` — os valores deixam de ficar embaçados. Chamada no fim do `init()`, no erro e por um temporizador de 12 s |
| `openAlivio(catId)` | Formulário de alívio. Também abre pela aba *Alívio* no topo do formulário de gasto |
| `reliefAmount(catId, mês)` | Soma dos alívios da categoria no mês. Entra em `effBudget`, `tetoDe`, `futureMonthData` e `monthBalance` |
| `dividirIgual()` · `reescalar()` · `alvDefinir()` | A divisão do alívio, sempre em centavos inteiros: igual com o resto nos primeiros; proporcional quando o valor muda depois de ajustado |
| `fontesAlivio()` · `fonteIcone(nome)` | Fontes fixas + as cadastradas (`user_metadata.alivio_fontes`); o ícone sai do nome |
| `desfazerAlivio(id)` | Pergunta se desfaz o grupo todo ou só a categoria |
| `imgSegura(url)` | Devolve a URL só se for data URI de imagem; senão `null`. Obrigatório antes de qualquer `src` vindo do banco |
| `fotoOuLetra(uid, letra)` | Foto de perfil da pessoa, ou a inicial |
| `salvarAvatar(input)` · `removerAvatar()` | Sobe e remove a foto de perfil |
| `telaWeb()` | `true` a partir de 1100px — o sistema web. `render()` troca de tela quando a largura cruza |
| `garantirTodos()` · `gastosTodos()` · `sujarTodos()` | Todo o histórico de gastos (cache de 5 min) já mesclado com o mês aberto. `sujarTodos()` depois de salvar ou apagar |
| `futurosDe(catId, mês)` | O que já está comprometido num mês futuro: parcelas reais + recorrentes projetados |
| `catsWeb()` · `moverCatWeb` · `ocultarCatWeb` · `toggleOrganizar` | Ordem e ocultas do Painel web (`gp-web-layout`) |
| `renderPainel(el)` | A home do web: KPIs, cards, ritmo do mês, onde foi o dinheiro, próximos meses |
| `abrirCatWeb(catId)` · `renderCatDetalhe(el)` | A análise completa de uma categoria. Também abre no celular pelo menu ⋯ |
| `renderRelatorios(el)` · `atualizarBI()` | Os Relatórios. `atualizarBI` redesenha só `#bi-out`, então a busca não perde o foco |
| `biChave(e)` · `biRotulo(k)` | Como agrupar: categoria, tipo, mês, dia da semana, cartão, local ou pessoa |
| `exportarCSV()` | Exporta o que está filtrado, com `;` e BOM, para abrir direto no Excel em português |
| `vbarsHtml` · `hbarsHtml` · `ritmoSvg` · `sparkSvg` · `kpiHtml` | Os gráficos, todos em HTML/SVG puro, sem biblioteca |

---

## 5. O que está no ar

### 5.0 O que a v6 mudou

**Card da categoria**
- Embaixo do disponível, dois blocos: **Por dia** — o disponível dividido pelos dias que
  faltam, contando hoje — e **No ritmo atual**, que diz *Cabe no mês*, *Acaba dia 18* ou
  *Estourou*. Substitui o antigo "o saldo acaba em 03 de mar.", que chegava a apontar datas
  meses à frente.
- Os três ícones mudos do topo (adiantar, transferir, ajustar) viraram **um menu ⋯** com
  nome e explicação de cada ação — e absorveu Compartilhar, Exportar e Histórico de
  atividades, que ficavam soltos no rodapé.
- Um **olho** ao lado liga o modo discreto.

**Lista de lançamentos**
- Agrupada por dia (*Hoje*, *Ontem*, *Sáb, 05 de set*), com subtotal quando o dia tem mais
  de um gasto.
- **A linha inteira é tocável** e abre a edição. Saíram os botões de lápis e lixeira de
  26px que ficavam em toda linha — a lixeira estava a um toque de apagar dado. Excluir mora
  agora dentro da edição.
- Categoria de só leitura ou recorrente previsto abre uma **ficha** em vez da edição.
- Tipo, parcela, cartão, quem lançou e endereço viram uma linha de detalhes discreta.

**Lançar um gasto**
- Valor grande no topo, com o cursor já nele.
- Categoria e tipo em chips com ícone, no lugar do `<select>`.
- **Seus de sempre**: os nomes que você repete na categoria. Um toque preenche o nome e, se
  o valor costuma ser o mesmo, o valor também. Lançamentos rápidos (nome = hora) ficam de
  fora.
- Autocompletar de descrição passou a preencher o valor típico daquele nome.
- Data em três chips: *Hoje*, *Ontem*, *Outra data*.
- Repetição, cartão, local e comprovante ficam em **Mais opções**, recolhido, com um
  resumo do que está marcado.
- O lançamento rápido do raio ganhou chips para escolher a categoria.

**Diálogos**: os 16 `confirm()` nativos viraram diálogos do app. O de excluir parcela
ganhou três botões — *Esta e as 4 seguintes*, *Só esta parcela*, *Cancelar* — no lugar do
antigo "OK apaga as futuras, Cancelar apaga só esta".

**Modo discreto**: embaça todo valor em dinheiro (classe `money` e mais uma lista de
seletores do Histórico e de Próximos meses). Liga pelo olho do card ou em Sua conta.

### 5.0.2 Lançar alívio (v6.2)

Um segundo tipo de lançamento, ao lado do gasto: **o alívio**, para cashback,
reembolso, bônus, estorno e o que mais devolver dinheiro.

- Abre pela aba **Gasto | Alívio** no topo do formulário de gasto novo, pelo menu ⋯ da
  categoria e, no web, pelo botão *Lançar alívio* do cabeçalho.
- **De onde veio**: Cashback, Reembolso, Bônus e Estorno são fixos. *Nova fonte*
  cadastra outra; *Editar* remove as cadastradas. Elas ficam em
  `user_metadata.alivio_fontes`, então seguem a pessoa entre aparelhos. Remover uma fonte
  não mexe nos alívios já lançados.
- **Vai para**: uma categoria recebe 100%. Com mais de uma, o valor é **dividido igual,
  em centavos exatos** (R$ 100 em três dá 33,34 · 33,33 · 33,33), e cada linha aceita
  R$ ou %. Com duas categorias, mexer numa completa a outra sozinho. Com três ou mais,
  o rodapé diz quanto falta ou passou, e a varinha de cada linha põe ali a diferença.
  **O botão só libera quando fecha 100%** e nenhuma categoria ficou com zero.
- **Onde aparece**: aumenta o limite do mês (o teto padrão não muda), entra no bloco
  Movimentações com o ícone da fonte e um X para desfazer, conta na sobra que o rollover
  leva, e nos Relatórios vira o KPI *Alívios* (com o gasto líquido) e um painel por fonte.
- Categoria sem teto não recebe alívio: não tem limite para aumentar.

**Por que limite e não gasto negativo:** o gasto continua sendo o que saiu de verdade —
o Histórico e os Relatórios não misturam compra com cashback. E o alívio segue o mesmo
caminho do adiantamento e do rollover, que já sabem aparecer para os dois lados de uma
categoria compartilhada.

### 5.0.3 Valores embaçados até carregar (v6.2)

O app desenha primeiro o que está no cache e depois o que vem do servidor. Entre um e
outro o número trocava na frente da pessoa. Agora o `<html>` nasce com a classe
`gp-carregando` (posta já na primeira linha do `app.js`) e **todo valor em dinheiro
fica embaçado e pulsando**, pelos mesmos seletores do modo discreto, até `valoresProntos()`.
Sem conexão, os valores do cache aparecem assim que o `init()` desiste.

### 5.0.1 O sistema web (v6.1)

A partir de **1100px** o app deixa de ser o celular esticado e vira outro produto, em
tela cheia:

- **Sidebar** no lugar da nav de baixo (é o mesmo `<nav>`, com outro CSS), com a logo e
  uma aba a mais, **Relatórios**. O FAB some: *Lançar gasto* e o raio do lançamento rápido
  moram no cabeçalho.
- **Painel** (Início): cinco KPIs (orçamento, gasto, disponível, por dia, já comprometido
  no mês que vem), um card por categoria com barra, por dia, ritmo e uma *sparkline* dos
  últimos 6 meses, e embaixo **Ritmo do mês** (gasto acumulado contra a linha do teto),
  **Onde foi o dinheiro** e **Próximos meses**.
- **Organizar** (só no web): setas movem a categoria, o olho esconde. Fica em
  `gp-web-layout`, não no banco. Os KPIs passam a somar só as visíveis e avisam isso.
- **Clicar num card abre a análise da categoria**: KPIs (disponível, por dia, ritmo, contra
  o mês anterior, média de 3 meses), **Passado e futuro** — 6 meses de gasto e 4 de
  comprometido, com a linha do teto —, o ritmo do mês, **Por tipo**, a tabela de
  lançamentos com busca e filtro por tipo, os próximos compromissos e as movimentações do
  limite.
- **Relatórios**: período (este mês, 3, 6, 12 meses, tudo), categoria, busca livre (nome,
  tipo, local, cartão) e **agrupar por** categoria, tipo, mês, dia da semana, cartão, local
  ou pessoa. Mostra KPIs, evolução mensal, distribuição, uma tabela ordenável que abre os
  lançamentos de cada grupo, dia da semana, top 10 e o comprometido à frente. Exporta CSV.

No **celular** nada disso atrapalha: a análise da categoria abre pelo ⋯ → *Análise
completa*, e os Relatórios por um botão no Histórico. Abaixo de 600px as tabelas escondem
as colunas secundárias para caber sem rolar para o lado.

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
- **Ajuste do orçamento do mês** — muda o teto só daquele mês. **Zero é um valor válido**:
  a categoria fica com orçamento zerado naquele mês e qualquer gasto já conta como
  estouro. Diferente de *sem teto*, que não tem orçamento nenhum e fica fora do total.
- **Transferência de limite** entre categorias, no mês corrente **ou num mês à frente**,
  para deixar arrumado antes de ele começar. Mês passado não aceita.
- **Adiantar limite do mês seguinte** — puxa parte do teto dos meses à frente para o mês
  atual, devolvendo em até 6 parcelas. Reversível. Ver
  [seção 5.3](#53-adiantar-limite-do-mês-seguinte-v514).
- **Tipos dentro da categoria** — em Comida, por exemplo: Preparos, Delivery, Restaurante.
  Opcional; cadastra na categoria e escolhe no lançamento.
- **Localização do lançamento** — o app pede o GPS sozinho ao abrir o lançamento e guarda o
  **endereço aproximado**. Ver [seção 5.4](#54-a-localização-do-lançamento-v515).
- **Lançamento rápido pelo raio** — botão ao lado do + : só o valor, e a hora vira a
  descrição.
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

### 5.3 Adiantar limite do mês seguinte (v5.14)

Puxa um pedaço do teto dos meses à frente para o mês atual. O `budget` da categoria **não
muda** — quem muda é o efetivo do mês.

Um adiantamento é um **grupo de linhas** em `budget_loans`, todas com o mesmo `loan_group`:
uma positiva no mês que recebe e uma negativa por mês de devolução. Adiantar 300 em Set,
devolvendo em 3:

```
2026-09  +300.00
2026-10  -100.00
2026-11  -100.00
2026-12  -100.00
```

`effBudget()` soma `loanAmount()` junto com o rollover, então o limite do mês já sai certo
em toda a tela sem nenhum caso especial. **Próximos meses** também conta, por isso a
devolução aparece lá como teto menor.

Desfazer é apagar o grupo — daí `loan_group` existir. **Um adiantamento por categoria por
mês**: dois grupos no mesmo mês tornariam o "desfazer" ambíguo, então o app manda desfazer
o atual antes de criar outro.

A divisão arredonda para baixo e joga a sobra na última parcela: 100 em 3 vira
33,33 + 33,33 + **33,34**. E não deixa criar parcela maior que o teto do mês que vai
devolver — senão o mês nasceria negativo.

> Uma tabela nova, e não `budget_rollovers`. Aquela tem `Prefer: resolution=merge-duplicates`
> nos inserts, o que sugere índice único em (`cat_id`, `from_month`, `to_month`) — a linha
> de devolução do primeiro mês cairia exatamente no mesmo par que o rollover automático e
> um sobrescreveria o outro em silêncio.

### 5.4 A localização do lançamento (v5.15)

Abriu o formulário de gasto novo, o app já pede o GPS e preenche sozinho. No lançamento
rápido é igual, em paralelo com a digitação do valor. Editar um gasto antigo **não**
recaptura — sobrescreveria onde a compra realmente foi.

Guarda os três: `lat`, `lng` e `place`. A coordenada serve para o link do mapa; **o que
aparece na tela é sempre o `place`**, porque `-23.561414, -46.655881` não diz nada a
ninguém.

A geocodificação reversa é feita no cliente, em cascata, sem chave de API:

| Onde | O que devolve |
|---|---|
| `nominatim.openstreetmap.org` | Rua com número, bairro e cidade — *Avenida Paulista 1578, Morro dos Ingleses, São Paulo* |
| `api.bigdatacloud.net` (reserva) | Só cidade e região |
| nenhum dos dois | Salva a coordenada sem nome; o pino continua abrindo o mapa |

Cada uma tem timeout próprio (6 s e 5 s) e **nada disso bloqueia o salvamento** — o
endereço entra no campo escondido conforme chega, e o gasto salva com o que houver.

Na lista o endereço vai na mesma linha da data, **cortado com reticências em uma linha
só** (`.expense-date` ganhou `nowrap` + `text-overflow`). Sem isso um endereço completo
quebrava em três linhas e dobrava a altura da linha do gasto. O endereço inteiro fica no
`title` do pino e no formulário de edição.

> Nominatim é gratuito mas tem política de uso (~1 requisição por segundo). Para um app
> pessoal, uma chamada por lançamento, está folgado. Se um dia der `429`, a reserva
> assume sozinha.

**A permissão não é do app (v6.2.1).** Quem guarda "permitir localização" é o sistema.
No iPhone, app de site instalado na tela de início costuma perguntar de novo a cada
abertura, e o app não tem como gravar essa resposta. O que o app faz para pedir menos:

- **Recusou, não pergunta de novo** na mesma abertura (`localNegado`, pelo erro de código
  1 ou pelo `navigator.permissions` dizendo `denied`).
- **Reaproveita o local por 5 minutos** (`ultimoLocal`): lançar três gastos seguidos pede
  o GPS uma vez só.
- Chave **Buscar o local sozinho** em Sua conta (`gp-local-auto`). Desligada, o formulário
  não pede nada ao abrir; o local só é buscado ao tocar em *Buscar minha localização*, ou
  em *Adicionar onde foi* no lançamento rápido.

Para o iPhone parar de perguntar, a saída é do lado dele: **Ajustes → Apps → Safari →
Localização → Permitir** (em iOS mais antigo, Ajustes → Safari → Localização).

### 5.5 O bloco de movimentações (v5.17)

Cada linha tem um **X que desfaz**, e desfazer quer dizer três coisas diferentes:

| Tipo | O que o X faz |
|---|---|
| Transferência | Devolve o valor no `month_budgets` das **duas** categorias e apaga a linha de `budget_transfers`. Se a categoria voltar ao orçamento padrão, o ajuste do mês é removido junto, e a etiqueta *ajustado* some |
| Saldo do mês anterior | **Zera o `amount`**, não apaga a linha |
| Adiantamento | Desfaz o **grupo inteiro** — o crédito deste mês e as devoluções dos meses seguintes. Uma perna sozinha deixaria a conta torta |

O rollover é zerado em vez de apagado porque `applyAutoRollover()` só cria quando não
existe linha para aquele par (`cat_id`, `from_month`, `to_month`). Apagar faria o próximo
boot **recriar** o saldo que você acabou de dispensar. Com a linha zerada ele entende que
aquele mês já foi resolvido, e o valor zero não muda o teto. Por isso
`movimentosDoMes()` descarta rollover com `|amount| < 0,005`: zerado não é movimentação,
é lápide.

O X só aparece em mês corrente ou futuro, e só na categoria que é sua.

Adiantamento, rollover e transferência de limite **não são gastos**, mas até a v5.16
usavam `.expense-item`, com o mesmo peso visual e empilhados por cima dos lançamentos de
verdade. Uma categoria com dez transferências no mês empurrava a primeira compra para
fora da tela — e nenhuma delas mostrava quando tinha acontecido.

Agora saem da `.exp-list` e viram um bloco próprio, **acima** de Lançamentos: hero → o que
mexeu no limite → o que você gastou.

- `movimentosDoMes()` junta as três origens num formato só (`ico`, `classe`, `titulo`,
  `onde`, `valor`, `quando`) e ordena por `created_at` **decrescente**. As três tabelas já
  tinham a coluna; ninguém estava usando.
- O cabeçalho mostra a **soma líquida** — o efeito real no teto do mês — e quantos ajustes
  foram.
- Recolhido por padrão a partir de **4 movimentações**; com até três fica aberto, porque
  esconder duas linhas é pior que mostrá-las. `movOpen[catId]` guarda o que o usuário
  escolheu e vence o padrão.
- Linha compacta: pastilha colorida de 26px, título em peso normal (não negrito, que é do
  gasto), origem e data no subtítulo.

### Plataforma
- PWA instalável, funciona offline com os dados em cache.
- Tema claro e escuro, sincronizado entre aparelhos.
- Trial de 14 dias; no plano gratuito, 3 lançamentos por dia e 2 categorias.
- Tela de PIN (o PIN é o ano corrente — proteção fraca, de conveniência).
- Tutorial em 11 passos com destaque nos elementos.
- **Lançamento rápido por link** (`#add?v=45,90&n=Padaria&cat=Mercado&card=Nubank&p=3`) —
  abre o formulário preenchido, para atalhos do iOS. Ver [seção 7](#7-lançamento-rápido-ios).
- **View de tablet** entre 700 e 1099px (era a partir de 900px até a v6.0; acima de 1100px
  quem manda é o sistema web da [seção 5.0.1](#501-o-sistema-web-v61)): largura até 1180px e as categorias numa faixa
  horizontal com setas ‹ › nas laterais, uma categoria por passo. A faixa de chips fica
  escondida, e por isso **cada card leva o nome da categoria no topo** — sem ele não dá
  para saber de quem é cada coluna. O arraste do celular é desligado; quem manda ali são
  as setas. Ver [seção 9.7](#97-o-que-quebra-só-no-desktop).
- **Movimentações do limite** — adiantamento, rollover e transferência saem da lista de
  gastos e viram um bloco próprio, recolhível, com data. Ver
  [seção 5.5](#55-o-bloco-de-movimentações-v517).

---

## 6. Limites conhecidos

| | |
|---|---|
| Comprovante | Guardado como data URI base64 **dentro da coluna**, não em Storage. Desde a v6 ele **não vai mais para o cache local** nem para a consulta do Histórico, então o estrago ficou contido — mas migrar para Storage continua sendo a melhoria mais óbvia pendente |
| PIN | É o ano corrente. Não é segurança, é conveniência |
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

### 9.0 Formulário duplicado apaga dado em silêncio

Até a v5.17, novo gasto e edição de gasto eram dois HTMLs escritos à mão, lado a lado. O
campo Tipo foi colocado só no novo — e como `saveExpense()` lê os inputs pelo `id`,
**editar qualquer gasto apagava o tipo dele**, sem erro nenhum. Na v6 existe um formulário
só, `expenseFormHtml(e)`, e os dois caminhos passam por ele.

O mesmo `saveExpense()` mandava `image_url` em toda edição, reaproveitando o valor que
estava em memória. Com o cache sem comprovante (ver abaixo), isso faria editar um gasto
**apagar a foto**. Agora `image_url` só vai no payload quando é gasto novo ou quando você
escolhe outra imagem.

### 9.0.1 O cache não guarda comprovante

`saveCache()` troca `image_url` por `_img:1` antes de gravar no `localStorage` — a cota é
de ~5 MB e o base64 das fotos estourava em silêncio, matando o modo offline. A lista usa
`image_url || _img` para mostrar o clipe, e `viewReceipt()` busca a imagem com
`getExpenseImage(id)` na hora de abrir.

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

A mesma regra vale para tudo que entra no limite: **o que muda o limite de uma categoria
compartilhada precisa ser legível pelos dois lados**. Na v6.1.1 apareceram dois furos:

- **Adiantamento.** `budget_loans` não tinha política de leitura para o convidado. O dono
  via o teto com o adiantamento; o convidado, sem — e no mês da devolução, o contrário.
- **`months.budgets` legado.** `baseBudget()` ainda caía no legado quando o mês não tinha
  `month_budgets`, e procurava na linha de `months` **de quem está logado**. O convidado
  achava o valor antigo *dele* para a categoria do outro. Agora o legado só vale para
  categoria própria, e o SQL da v6.1.1 copiou o legado do dono para `month_budgets` (só
  os meses que faltavam), para os dois lados convergirem.

Para conferir, o disponível de uma categoria no mês é sempre: `month_budgets[mês]` (ou
`budget`) + soma de `budget_rollovers.amount` com `to_month = mês` + soma de
`budget_loans.amount` do mês + soma de `budget_reliefs.amount` do mês − soma de
`expenses.value` do mês.

### 9.5 Colisão de classe CSS

`.plan-card` já existia no paywall e colidiu com cards novos de mesmo nome. Antes de criar
classe, conferir se o nome já existe em `style.css`.

**O mesmo vale para função JS, e é pior.** O `app.js` é um script só, sem módulos: duas
`function renderSplit` no arquivo e **a última vence em silêncio**, sem erro de sintaxe.
Na v6.2 a divisão do alívio nasceu como `renderSplit()` e foi engolida pela tela Divisão,
que tem uma `renderSplit(el)` mais abaixo. Antes de criar função, conferir:

```bash
grep -nE "function nome|(const|let) nome" app.js
```

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

### 9.7 O que quebra só no desktop

A view larga é a mesma tela com outro CSS, e três defeitos moraram exatamente aí.

**O chat virava um painel solto.** `.dm-overlay` é `position:fixed; inset:0` com
`max-width:900px; margin:0 auto`. No celular isso ocupa tudo; em 1240px vira uma coluna de
900px com a tela de Amigos acesa dos dois lados, sem nada indicando que é um modal. O
escurecimento vem de `box-shadow:0 0 0 100vmax rgba(0,0,0,.55)` — sombra com espalhamento
gigante, que pinta fora do elemento **sem precisar de um elemento de backdrop**.

**As mensagens grudavam no topo.** `.dm-body` é uma coluna flex; com pouca conversa numa
janela alta, as bolhas ficavam lá em cima e a barra de digitar lá embaixo, com um vazio no
meio. `.dm-body>:first-child{margin-top:auto}` empurra tudo para baixo. **Não use
`justify-content:flex-end`** — quando a conversa passa da altura, ele corta o topo e não
dá para rolar até a primeira mensagem.

**`scrollBy` com `behavior:'smooth'` não move nada** quando o container tem
`scroll-snap-type`. `slideCats()` calcula o alvo, tenta o `scrollTo` suave e, 400 ms
depois, **se o `scrollLeft` não saiu do lugar**, atribui na marra. Só corrige quando
literalmente nada aconteceu, então onde o suave funciona ele não atropela a animação.

### 9.8 Apagar categoria é apagar seis tabelas

`api.deleteCategory()` só apaga a linha de `categories`. Seis tabelas apontam para ela, e
`expenses.cat_id` tem chave estrangeira — então deletar categoria com lançamento sempre
deu erro, até a v5.16. A ordem que funciona:

```
expenses
budget_rollovers · budget_transfers · budget_loans · category_shares · activity_log
categories
```

Os cinco do meio vão em paralelo, cada um com `.catch(()=>{})`: nem toda instalação tem
todas as tabelas, e uma faltando não pode travar o resto. `expenses` vai primeiro e
sozinho, porque é o único que é chave estrangeira de verdade — se ele falhar, não adianta
seguir.

**O que sobra de propósito**: lançamento de outra pessoa numa categoria compartilhada. A
RLS de `expenses` é `user_id = auth.uid()`, então o dono da categoria consegue *ver* mas
não consegue *apagar* a linha do parceiro. Nesse caso a FK barra o delete da categoria e o
app diz quantos lançamentos de outra pessoa sobraram, em vez de um "erro ao deletar" seco.
Por isso `getExpensesOfCat()` traz `user_id`: é dali que sai a contagem.

A confirmação mostra quantos lançamentos e quanto somam, **contando todos os meses** — a
parcela de dezembro também morre, e é justo avisar antes.

### 9.8.1 Estilo inline ganha da media query

`enterApp()` fazia `#app.style.display='flex'`. No web o `#app` precisa ser
`display:grid` (sidebar + conteúdo), e **estilo inline vence qualquer regra do CSS**, com
ou sem `@media`. Resultado: a nav ocupava a largura toda e o conteúdo ia para baixo.
Agora é `style.display=''`, que só remove o `none` e deixa o CSS decidir. Para mostrar um
elemento que o CSS posiciona, **limpe o inline, não escreva outro valor**.

O FAB do desktop tinha `right:calc(50% - 590px + 28px)` para acompanhar a coluna de
1180px. Abaixo de 1180px de janela a conta fica negativa e o botão sai da tela. Offset fixo
resolve.

E a ordem das regras pesa: `.bi-back{display:none}` no começo do arquivo perdia para
`.wd-back{display:inline-flex}` declarado depois, no mesmo elemento. Mesma
especificidade, ganha a última. Para esconder, use o seletor composto
(`.wd-back.bi-back`).

### 9.9 Remover CSS em bloco

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
push-setup.sql tabela + RLS, e o gatilho que chama a funcao
gatilho        INSERT em expenses  ->  net.http_post  ->  notify-expense
Edge Function  notify-expense: descobre quem avisar, assina VAPID, envia
sw.js          push -> showNotification · notificationclick -> foca a janela
```

O gatilho é escrito **em SQL**, não pelo *Database Webhook* do painel. Não é só gosto: o
webhook da UI manda `to_jsonb(new)`, ou seja **a linha inteira de `expenses`, com o
`image_url`** — que é o comprovante em base64. Um lançamento com foto viraria um POST de
centenas de KB. O gatilho de `push-setup.sql` monta o `record` à mão com os oito campos
que a função usa, e nada mais.

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

**5. Ligue o gatilho.** Volte ao `push-setup.sql`, seção 3: descomente o
`vault.create_secret` do passo **3.1** colando sua `service_role` (Settings › API), rode, e
comente de novo. Depois rode **3.2** e **3.3**. A chave fica no Vault, não no corpo da
função.

O painel tem **Database › Webhooks**, que faz o mesmo — mas prefira o SQL, pelo motivo da
[seção 11.2](#112-as-peças). Se ainda assim quiser a UI, o gatilho do SQL e o webhook do
painel **não podem conviver**: os dois disparando viram notificação dobrada.

**6. Instale o app na tela de início** (iPhone: Compartilhar › Adicionar à Tela de Início),
abra por lá, vá em **Sua conta** e ligue a chave de notificações.

### 11.5 Quando não chegar

Nesta ordem, que é da ponta mais provável para a menos:

1. **`pg_net` está instalado?** É ele que faz o POST de dentro do Postgres, e sem ele
   nada sai — silenciosamente, porque o gatilho engole o erro para não derrubar o
   lançamento.

   ```sql
   select e.extname, n.nspname as schema from pg_extension e
     join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_net';
   ```

   Zero linhas: `create extension if not exists pg_net;`. Se `net._http_response` não
   existir, é sempre isto.

2. `select count(*) from push_subscriptions;` — se for zero, ninguém se inscreveu: o
   problema está no app ou na permissão, não no envio.
3. O Postgres guarda a resposta de cada chamada. `status_code` 200 é a função
   respondendo, 401 é chave errada no Vault, e nenhuma linha significa que o gatilho não
   disparou:

   ```sql
   select id, status_code, left(content, 200) as resposta, created
     from net._http_response order by created desc limit 5;
   ```

4. Painel do Supabase › **Edge Functions › notify-expense › Logs**. A função devolve
   `{sent, gone, recipients}` ou um `skipped` dizendo por quê parou.
5. `skipped: "ninguém para avisar"` significa que o compartilhamento não está `accepted`,
   ou que só existe você.
6. Se `sent` for maior que zero e mesmo assim nada aparecer no iPhone: quase sempre é o app
   aberto no Safari em aba, e não o instalado.
7. iOS desinscreve sozinho quem fica muito tempo sem abrir. A função apaga a inscrição
   morta (404/410); é só religar a chave em Sua conta.

> O gatilho tem `exception when others` para que uma falha de notificação nunca derrube um
> lançamento. Mas ele **grita antes de engolir**: o erro vira `raise warning` em
> **Logs & Analytics › Postgres Logs**. Foi assim que um `pg_net` faltando passou
> despercebido uma vez — o gasto salvava, e simplesmente nada acontecia.

## 12. Histórico de versões

| Versão | O quê |
|---|---|
| 6.2.1 | Localização pede menos: não repete depois de recusada, reaproveita o local por 5 minutos e ganhou chave em Sua conta para só buscar quando tocar |
| **6.2** | **Lançar alívio**: cashback, reembolso, bônus e fontes próprias, dividido em uma ou várias categorias com fechamento em 100%, entrando no limite, nas Movimentações e nos Relatórios. Valores embaçados até o servidor responder, sem trocar número na frente da pessoa |
| 6.1.1 | Categoria compartilhada com o mesmo limite para os dois: adiantamento visível ao convidado e `months.budgets` legado ignorado para categoria de outra pessoa |
| **6.1** | **Sistema web.** Cabeçalho do celular que não corta a logo. Acima de 1100px: sidebar, Painel com KPIs e gráficos, organizar e ocultar categorias só no web, análise completa de cada categoria (passado, futuro, ritmo, por tipo, tabela com busca), Relatórios com período, busca, sete agrupamentos, tabela ordenável com detalhe e CSV. Botões de lançar no cabeçalho do web. FAB que saía da tela abaixo de 1180px |
| **6.0** | **GastoPensado.** Nome, logo, ícones, paleta (marca violeta separada do verde de dinheiro) e tipografia novos. Card com "por dia" e ritmo, menu ⋯, lista por dia com linha tocável, formulário único de gasto com chips e "seus de sempre", ícone por categoria, diálogos próprios, modo discreto, milhar no `brl()`, cache e Histórico sem comprovante |
| 5.19 | Transferência de limite em meses futuros; X para desfazer cada movimentação |
| 5.18 | Orçamento do mês aceita zero |
| 5.17 | Movimentações do limite viram bloco recolhível com data; nome da categoria nos cards do desktop; edição de gasto volta a ter o campo Tipo |
| 5.16 | Deletar categoria apaga os lançamentos e o resto que aponta para ela, em vez de dar erro |
| 5.15 | Localização vira endereço aproximado, pedido automaticamente ao abrir o lançamento |
| 5.14 | Adiantar limite do mês seguinte, tipos dentro da categoria, localização do lançamento e lançamento rápido só com o valor |
| 5.13 | Desktop: faixa de categorias com setas, chat com fundo escurecido e mensagens no rodapé; badge de mensagem não lida passa a sincronizar entre aparelhos |
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

Tudo até a 5.19 foi lançado com o nome GastoCerto.

`git log --oneline` traz o resto.
