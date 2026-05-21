import { useState } from 'react'
import {
  BookOpen, LayoutDashboard, Package, Plus, ArrowRightLeft,
  ShieldCheck, Trash2, FlaskConical, Users, ChevronDown, ChevronRight,
  CheckCircle2, Info, AlertTriangle, Lightbulb, Clock, ArrowRight,
  FileText, Search, Lock, PackageCheck, BarChart3,
} from 'lucide-react'

type SectionId =
  | 'visao-geral'
  | 'abertura-lote'
  | 'movimentacao'
  | 'qualidade'
  | 'decapagem'
  | 'dashboard'
  | 'administracao'

interface Section {
  id: SectionId
  label: string
  icon: React.ElementType
  color: string
}

const sections: Section[] = [
  { id: 'visao-geral',    label: 'Visão Geral',       icon: BookOpen,       color: 'text-blue-400' },
  { id: 'abertura-lote',  label: 'Abrindo um Lote',   icon: Plus,           color: 'text-emerald-400' },
  { id: 'movimentacao',   label: 'Movimentação',       icon: ArrowRightLeft, color: 'text-sky-400' },
  { id: 'qualidade',      label: 'Qualidade',          icon: ShieldCheck,    color: 'text-violet-400' },
  { id: 'decapagem',      label: 'Decapagem',          icon: FlaskConical,   color: 'text-amber-400' },
  { id: 'dashboard',      label: 'Dashboard',          icon: LayoutDashboard,color: 'text-pink-400' },
  { id: 'administracao',  label: 'Administração',      icon: Users,          color: 'text-slate-400' },
]

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg text-sm" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
      <Lightbulb className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
      <span className="text-slate-300">{children}</span>
    </div>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
      <span className="text-slate-300">{children}</span>
    </div>
  )
}

function Info_({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg text-sm" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)' }}>
      <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
      <span className="text-slate-300">{children}</span>
    </div>
  )
}

interface StepProps {
  number: number
  title: string
  children: React.ReactNode
}

function Step({ number, title, children }: StepProps) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold text-sm shrink-0">
          {number}
        </div>
        <div className="w-px flex-1 bg-border/40 mt-2" />
      </div>
      <div className="pb-6 min-w-0 flex-1">
        <p className="font-semibold text-sm mb-2">{title}</p>
        <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  )
}

function AccordionItem({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 text-sm text-muted-foreground border-t border-border/40">
          {children}
        </div>
      )}
    </div>
  )
}

function Badge_({ children, color = 'default' }: { children: React.ReactNode; color?: 'green' | 'red' | 'yellow' | 'blue' | 'amber' | 'slate' | 'default' }) {
  const styles: Record<string, string> = {
    green:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    red:     'bg-red-500/15 text-red-300 border-red-500/30',
    yellow:  'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
    blue:    'bg-blue-500/15 text-blue-300 border-blue-500/30',
    amber:   'bg-amber-500/15 text-amber-300 border-amber-500/30',
    slate:   'bg-slate-500/15 text-slate-300 border-slate-500/30',
    default: 'bg-primary/15 text-primary border-primary/30',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[color]}`}>
      {children}
    </span>
  )
}

function SectionVisaoGeral() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">O que é este sistema?</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          O <strong className="text-foreground">Controle de Retrabalhos Industriais Caloi</strong> é um sistema digital para rastrear peças e conjuntos que precisam de retrabalho na linha de produção. Em vez de planilhas, tudo fica registrado em tempo real, com histórico completo de cada movimentação.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Package,      color: 'text-emerald-400', bg: 'rgba(52,211,153,0.08)', title: 'Lotes',       desc: 'Cada grupo de peças com defeito vira um lote com código único (RT-YYYYMMDD-XXXX).' },
          { icon: ArrowRightLeft,color: 'text-sky-400',    bg: 'rgba(56,189,248,0.08)', title: 'Etapas',      desc: 'As peças percorrem etapas do processo: Entrada, operações, Aprovado ou Sucata.' },
          { icon: ShieldCheck,  color: 'text-violet-400',  bg: 'rgba(167,139,250,0.08)',title: 'Qualidade',   desc: 'A Qualidade bloqueia, inspeciona, aprova ou descarta. Tudo rastreado.' },
        ].map(c => (
          <div key={c.title} className="p-4 rounded-xl space-y-2" style={{ background: c.bg, border: `1px solid ${c.bg.replace('0.08', '0.25')}` }}>
            <c.icon className={`h-6 w-6 ${c.color}`} />
            <p className="font-semibold text-sm">{c.title}</p>
            <p className="text-xs text-muted-foreground">{c.desc}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-semibold mb-3 text-sm">Ciclo de vida de um lote</h3>
        <div className="flex items-center gap-1 flex-wrap text-xs">
          {[
            { label: 'Aberto',        color: 'blue' as const },
            { label: '→' },
            { label: 'Em Retrabalho', color: 'yellow' as const },
            { label: '→' },
            { label: 'Bloqueado QLD', color: 'amber' as const },
            { label: '→' },
            { label: 'Aprovado',      color: 'green' as const },
            { label: 'ou' },
            { label: 'Sucata',        color: 'red' as const },
            { label: 'ou' },
            { label: 'Decapagem',     color: 'amber' as const },
          ].map((item, i) =>
            'color' in item
              ? <Badge_ key={i} color={item.color}>{item.label}</Badge_>
              : <span key={i} className="text-muted-foreground font-medium">{item.label}</span>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3 text-sm">Perfis de acesso</h3>
        <div className="space-y-2 text-sm">
          {[
            { role: 'Usuário',        color: 'slate' as const, desc: 'Abre lotes, movimenta material entre etapas, consulta dashboard e lotes.' },
            { role: 'Qualidade',      color: 'blue' as const,  desc: 'Tudo do Usuário + bloqueios, aprovações, sucata e gestão de decapagem.' },
            { role: 'Administrador',  color: 'default' as const,desc: 'Acesso completo. Gerencia usuários, materiais, configurações e pode editar/excluir lotes.' },
          ].map(r => (
            <div key={r.role} className="flex items-start gap-3 p-3 rounded-lg border border-border/40">
              <Badge_ color={r.color}>{r.role}</Badge_>
              <p className="text-xs text-muted-foreground">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SectionAberturaLote() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Abrindo um Lote de Retrabalho</h2>
        <p className="text-muted-foreground text-sm">Use quando uma ou mais peças saem da linha com defeito e precisam de retrabalho.</p>
      </div>

      <Info_>Acesse pelo menu lateral <strong>Lotes</strong> → botão <strong>+ Novo Lote</strong> no canto superior direito.</Info_>

      <div className="space-y-0">
        <Step number={1} title="Buscar o Material (Part Number)">
          <p>No campo de busca, digite o código PN ou parte da descrição do material. O sistema busca em tempo real.</p>
          <p>Selecione o material correto na lista de sugestões. O PN ficará destacado no formulário.</p>
          <Tip>Pode buscar pelo código completo (ex: <code className="text-primary font-mono">12345-001</code>) ou palavras da descrição (ex: <code className="text-primary font-mono">quadro</code>).</Tip>
        </Step>
        <Step number={2} title="Preencher Quantidade e Origem">
          <p>Informe a <strong className="text-foreground">quantidade de peças</strong> com problema e o <strong className="text-foreground">setor de origem</strong> (ex: Pintura, Montagem, Solda).</p>
        </Step>
        <Step number={3} title="Selecionar Etapa Inicial">
          <p>Escolha a etapa onde o material vai entrar. Normalmente é <Badge_ color="blue">Entrada</Badge_>, mas pode ser qualquer etapa ativa do processo.</p>
        </Step>
        <Step number={4} title="Informar o Defeito">
          <p>Selecione o <strong className="text-foreground">tipo de defeito</strong> no campo correspondente e preencha uma <strong className="text-foreground">descrição detalhada</strong> do problema encontrado.</p>
          <Tip>Quanto mais detalhada a descrição, mais fácil fica o retrabalho e a rastreabilidade futura.</Tip>
        </Step>
        <Step number={5} title="Bloqueio de Qualidade">
          <p>O campo <strong className="text-foreground">Bloqueio de Qualidade</strong> fica marcado por padrão. Informe o número do documento NC/RNC se já disponível.</p>
          <Warning>Lotes sem bloqueio registrado aparecem como <Badge_ color="red">Alerta Vermelho</Badge_> no Dashboard. O analista de Qualidade precisará formalizar o bloqueio em seguida.</Warning>
        </Step>
        <Step number={6} title="Confirmar Abertura">
          <p>Clique em <strong className="text-foreground">Abrir Lote</strong>. O sistema gera o código automaticamente no formato <code className="text-primary font-mono">RT-YYYYMMDD-XXXX</code> e redireciona para os detalhes do lote.</p>
        </Step>
      </div>
    </div>
  )
}

function SectionMovimentacao() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Movimentando Material Entre Etapas</h2>
        <p className="text-muted-foreground text-sm">Registra quando as peças passam de uma etapa para outra no processo de retrabalho.</p>
      </div>

      <Info_>Acesse pelo menu <strong>Lotes</strong> → clique no lote desejado → botão <strong>Movimentar</strong>.</Info_>

      <div className="space-y-0">
        <Step number={1} title="Selecionar a Etapa de Origem">
          <p>O sistema mostra automaticamente todas as etapas que têm saldo disponível para esse lote. Selecione de onde o material está saindo.</p>
        </Step>
        <Step number={2} title="Selecionar a Etapa de Destino">
          <p>Escolha para qual etapa o material vai. Você não pode mover para a mesma etapa de origem.</p>
        </Step>
        <Step number={3} title="Informar a Quantidade">
          <p>Digite quantas peças serão movidas. O sistema valida se há saldo suficiente na etapa de origem.</p>
        </Step>
        <Step number={4} title="Confirmar Movimentação">
          <p>Clique em <strong className="text-foreground">Movimentar</strong>. O saldo é atualizado em tempo real.</p>
        </Step>
      </div>

      <AccordionItem title="Como funciona o Estorno (desfazer movimentação)?">
        <p>Na página de detalhes do lote, vá até a seção <strong>Movimentações</strong>. Movimentações elegíveis têm um botão de estorno.</p>
        <p>Ao estornar, o saldo retorna para a etapa de origem da movimentação original. É necessário informar o motivo.</p>
        <Warning>Não é possível estornar uma movimentação se a etapa de destino não tiver mais o saldo necessário (ex.: se o material já foi movido novamente).</Warning>
      </AccordionItem>

      <AccordionItem title="O que significa cada etapa?">
        <div className="space-y-2">
          {[
            { name: 'Entrada',          desc: 'Ponto de chegada do material com defeito.' },
            { name: 'Decapagem Externa', desc: 'Material em processo externo de remoção de tinta.' },
            { name: 'Aprovado',         desc: 'Material que passou pela inspeção de qualidade.' },
            { name: 'Sucata',           desc: 'Material descartado definitivamente.' },
          ].map(e => (
            <div key={e.name} className="flex gap-2">
              <span className="font-mono text-primary text-xs shrink-0 w-36">{e.name}</span>
              <span className="text-xs">{e.desc}</span>
            </div>
          ))}
        </div>
      </AccordionItem>
    </div>
  )
}

function SectionQualidade() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Gestão de Qualidade</h2>
        <p className="text-muted-foreground text-sm">Acesso exclusivo para perfis <Badge_ color="blue">Qualidade</Badge_> e <Badge_ color="default">Administrador</Badge_>.</p>
      </div>

      <Info_>Acesse pelo menu lateral <strong>Qualidade</strong>.</Info_>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            icon: Lock,       color: 'text-red-400',     bg: 'rgba(239,68,68,0.08)',
            title: 'Bloquear Lote',
            desc: 'Formaliza o bloqueio de qualidade. Registra o número NC/RNC e observações. Lotes pendentes aparecem na aba "Pendentes de Bloqueio".',
          },
          {
            icon: CheckCircle2, color: 'text-emerald-400', bg: 'rgba(52,211,153,0.08)',
            title: 'Aprovar Quantidade',
            desc: 'Após inspeção, aprova as peças conformes. Você escolhe a etapa de origem, a quantidade e o documento de aprovação.',
          },
          {
            icon: Trash2,    color: 'text-orange-400',  bg: 'rgba(249,115,22,0.08)',
            title: 'Enviar para Sucata',
            desc: 'Para peças irrecuperáveis. É obrigatório informar o motivo. O registro é imutável e rastreável.',
          },
          {
            icon: FlaskConical, color: 'text-amber-400', bg: 'rgba(245,158,11,0.08)',
            title: 'Enviar para Decapagem',
            desc: 'Para quadros pintados com cor errada. O material sai para processo externo e retorna com PN diferente (quadro bruto).',
          },
        ].map(a => (
          <div key={a.title} className="p-4 rounded-xl space-y-2" style={{ background: a.bg, border: `1px solid ${a.bg.replace('0.08', '0.2')}` }}>
            <div className="flex items-center gap-2">
              <a.icon className={`h-5 w-5 ${a.color}`} />
              <span className="font-semibold text-sm">{a.title}</span>
            </div>
            <p className="text-xs text-muted-foreground">{a.desc}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-sm">Fluxo típico de inspeção</h3>
        <div className="space-y-0">
          <Step number={1} title="Identificar lote pendente">
            <p>Na aba <strong>Pendentes de Bloqueio</strong>, veja os lotes em alerta vermelho. Quanto mais dias, mais urgente.</p>
          </Step>
          <Step number={2} title="Registrar o bloqueio formal">
            <p>Clique em <strong>Bloquear</strong>, informe o número do documento NC/RNC e salve. O lote muda para status <Badge_ color="amber">Bloqueado</Badge_>.</p>
          </Step>
          <Step number={3} title="Inspecionar e decidir">
            <p>Na aba <strong>Bloqueados/Em Inspeção</strong>, selecione a ação correta para cada lote: <Badge_ color="green">Aprovar</Badge_>, <Badge_ color="red">Sucata</Badge_> ou <Badge_ color="amber">Decapagem</Badge_>.</p>
          </Step>
        </div>
      </div>

      <Tip>É possível aprovar e sucatar quantidades parciais. Por exemplo: de um lote de 10 peças, aprovar 7 e enviar 3 para sucata.</Tip>
    </div>
  )
}

function SectionDecapagem() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Processo de Decapagem Externa</h2>
        <p className="text-muted-foreground text-sm">Tratamento químico que remove toda a tinta, retornando o quadro à forma bruta. O PN muda do quadro pintado para o quadro bruto.</p>
      </div>

      <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Entra como</p>
            <Badge_ color="red">Quadro Pintado (PN-A)</Badge_>
          </div>
          <ArrowRight className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Sai como</p>
            <Badge_ color="green">Quadro Bruto (PN-B)</Badge_>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">O sistema registra automaticamente esta transformação De/Para para rastreabilidade completa.</p>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3">Como enviar para Decapagem</h3>
        <div className="space-y-0">
          <Step number={1} title="Acessar a página de Qualidade">
            <p>O lote precisa estar com status <Badge_ color="amber">Bloqueado</Badge_> ou <Badge_ color="blue">Em Inspeção</Badge_>.</p>
          </Step>
          <Step number={2} title="Clicar no botão Decapagem">
            <p>Na lista de lotes bloqueados, clique no botão âmbar <strong>Decapagem</strong> no lote correspondente.</p>
          </Step>
          <Step number={3} title="Preencher o formulário">
            <p>Selecione a etapa de onde o material sairá, a quantidade e adicione observações se necessário.</p>
          </Step>
          <Step number={4} title="Confirmar o envio">
            <p>O lote muda para <Badge_ color="amber">Em Decapagem</Badge_> e aparece na página de Decapagem, aba "Aguardando Retorno".</p>
          </Step>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3">Como registrar o retorno</h3>
        <div className="space-y-0">
          <Step number={1} title="Acessar menu Decapagem">
            <p>No menu lateral, clique em <strong>Decapagem</strong>. Os lotes aguardando ficam na aba <strong>Aguardando Retorno</strong>.</p>
          </Step>
          <Step number={2} title="Clicar em Registrar Retorno">
            <p>Clique no botão âmbar <strong>Registrar Retorno</strong> no lote correspondente.</p>
          </Step>
          <Step number={3} title="Selecionar o PN do quadro bruto">
            <p>No campo de busca, localize o Part Number do quadro bruto que retornou. Este será o PN do novo lote.</p>
          </Step>
          <Step number={4} title="Escolher etapa de entrada e confirmar">
            <p>Selecione a etapa onde o quadro bruto vai entrar na produção. Clique em <strong>Confirmar Retorno</strong>.</p>
            <p>O sistema: fecha o lote original, cria um novo lote com o PN bruto e registra o De/Para no histórico.</p>
          </Step>
        </div>
      </div>

      <Info_>O <strong>Histórico De/Para</strong> (segunda aba da página Decapagem) mostra todas as transformações já realizadas: qual lote gerou qual material bruto, quando e por quem.</Info_>
    </div>
  )
}

function SectionDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Entendendo o Dashboard</h2>
        <p className="text-muted-foreground text-sm">Visão executiva do estado atual dos retrabalhos na fábrica.</p>
      </div>

      <Info_>Acesse pelo menu lateral <strong>Dashboard</strong>. Os dados atualizam automaticamente a cada visita.</Info_>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { icon: Package,   color: 'text-blue-400',  title: 'Lotes em Aberto',     desc: 'Quantidade de lotes ativos que ainda não foram encerrados.' },
          { icon: BarChart3, color: 'text-sky-400',   title: 'Qtd. Total em Aberto', desc: 'Soma de todas as peças nos lotes ativos (quantity_open).' },
          { icon: AlertTriangle, color: 'text-red-400', title: 'Pend. de Bloqueio', desc: 'Lotes abertos sem bloqueio de qualidade formalizado. ALERTA CRÍTICO — meta: zero.' },
          { icon: Clock,     color: 'text-orange-400',title: 'Aging Médio',         desc: 'Média de dias que os lotes estão abertos. Quanto menor, melhor.' },
          { icon: Trash2,    color: 'text-orange-400',title: 'Taxa de Sucata',      desc: 'Percentual do total de peças descartadas em relação ao total aberto.' },
        ].map(k => (
          <div key={k.title} className="flex gap-3 p-3 rounded-lg border border-border/40">
            <k.icon className={`h-5 w-5 ${k.color} shrink-0 mt-0.5`} />
            <div>
              <p className="text-sm font-semibold">{k.title}</p>
              <p className="text-xs text-muted-foreground">{k.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">Cores do Aging (tempo em aberto)</h3>
        <div className="space-y-2">
          {[
            { color: 'bg-emerald-500', label: '0–2 dias',  desc: 'Normal — retrabalho recente.' },
            { color: 'bg-yellow-500',  label: '3–5 dias',  desc: 'Atenção — verificar andamento.' },
            { color: 'bg-orange-500',  label: '6–10 dias', desc: 'Urgente — retrabalho atrasado.' },
            { color: 'bg-red-500',     label: '11+ dias',  desc: 'Crítico — escalar para gestão.' },
          ].map(a => (
            <div key={a.label} className="flex items-center gap-3 text-sm">
              <div className={`w-3 h-3 rounded-full ${a.color} shrink-0`} />
              <span className="font-medium w-20 shrink-0">{a.label}</span>
              <span className="text-muted-foreground text-xs">{a.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <AccordionItem title="Como usar o Drilldown por Part Number?">
        <p>No gráfico de barras do Dashboard, clique em qualquer barra (Part Number) para ver os detalhes daquele material específico:</p>
        <ul className="list-disc list-inside space-y-1 text-xs mt-2">
          <li>Linha do tempo de movimentações e eventos de qualidade</li>
          <li>Tabela de lotes ativos daquele PN</li>
          <li>Resumo de quantidade e aging</li>
        </ul>
        <p className="mt-2">Para voltar à visão geral, clique no X do filtro ou na mesma barra novamente.</p>
      </AccordionItem>
    </div>
  )
}

function SectionAdministracao() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1">Funções de Administração</h2>
        <p className="text-muted-foreground text-sm">Acesso exclusivo para <Badge_ color="default">Administrador</Badge_>.</p>
      </div>

      <div className="space-y-3">
        <AccordionItem title="Gerenciar Usuários">
          <p>Menu <strong>Usuários</strong> → lista todos os cadastros. Você pode:</p>
          <ul className="list-disc list-inside space-y-1 text-xs mt-2">
            <li><strong>Aprovar</strong> novos cadastros que estão com status Pendente</li>
            <li><strong>Alterar o perfil</strong> de um usuário (Usuário, Qualidade, Admin)</li>
            <li><strong>Inativar</strong> usuários que saíram da empresa</li>
          </ul>
          <Tip>Novos usuários precisam ser aprovados manualmente antes de conseguir acessar o sistema.</Tip>
        </AccordionItem>

        <AccordionItem title="Gerenciar Materiais (Part Numbers)">
          <p>Menu <strong>Materiais</strong> → lista todos os PNs cadastrados. Você pode:</p>
          <ul className="list-disc list-inside space-y-1 text-xs mt-2">
            <li>Adicionar novos Part Numbers com descrição, família e tipo de material</li>
            <li>Editar dados de PNs existentes</li>
            <li>Desativar PNs que não são mais utilizados</li>
          </ul>
        </AccordionItem>

        <AccordionItem title="Editar e Excluir Lotes">
          <p>Na lista de lotes (<strong>Lotes</strong>), o administrador vê dois botões adicionais em cada linha:</p>
          <ul className="list-disc list-inside space-y-1 text-xs mt-2">
            <li><strong>Editar</strong> — altera PN, quantidade, status, etapa inicial e outros dados do lote</li>
            <li><strong>Excluir</strong> — remove o lote e todos os seus dados associados de forma permanente</li>
          </ul>
          <Warning>A exclusão de lotes é irreversível e apaga todos os movimentos, eventos de qualidade e registros relacionados.</Warning>
        </AccordionItem>

        <AccordionItem title="Auditoria">
          <p>Menu <strong>Auditoria</strong> → log completo de todas as ações realizadas no sistema:</p>
          <ul className="list-disc list-inside space-y-1 text-xs mt-2">
            <li>Quem fez cada ação e quando</li>
            <li>Dados antes e depois de cada alteração</li>
            <li>Filtrável por tipo de ação e período</li>
          </ul>
        </AccordionItem>

        <AccordionItem title="Exportar Relatório Excel">
          <p>Na página <strong>Lotes</strong>, clique no botão <strong>Exportar Excel</strong>. O relatório inclui:</p>
          <ul className="list-disc list-inside space-y-1 text-xs mt-2">
            <li>Todos os lotes com status, quantidades e aging</li>
            <li>Filtros aplicados são respeitados na exportação</li>
            <li>Aba separada com movimentações e eventos de qualidade</li>
          </ul>
        </AccordionItem>
      </div>
    </div>
  )
}

const sectionComponents: Record<SectionId, React.FC> = {
  'visao-geral':   SectionVisaoGeral,
  'abertura-lote': SectionAberturaLote,
  'movimentacao':  SectionMovimentacao,
  'qualidade':     SectionQualidade,
  'decapagem':     SectionDecapagem,
  'dashboard':     SectionDashboard,
  'administracao': SectionAdministracao,
}

export default function ManualPage() {
  const [activeSection, setActiveSection] = useState<SectionId>('visao-geral')
  const SectionContent = sectionComponents[activeSection]

  return (
    <div className="flex gap-6 h-full">
      {/* Sidebar do manual */}
      <aside className="w-52 shrink-0 hidden md:block">
        <div className="sticky top-0 space-y-1">
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Manual</span>
            </div>
          </div>
          {sections.map(s => {
            const Icon = s.icon
            const isActive = activeSection === s.id
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                  isActive
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                }`}
                style={isActive ? {
                  background: 'rgba(232,41,28,0.1)',
                  borderLeft: '2px solid #E8291C',
                } : {}}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? s.color : 'text-muted-foreground/60'}`} />
                <span className="truncate">{s.label}</span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        {/* Mobile tabs */}
        <div className="md:hidden mb-4 flex gap-2 overflow-x-auto pb-2">
          {sections.map(s => {
            const Icon = s.icon
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all shrink-0 ${
                  activeSection === s.id
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'border border-border text-muted-foreground'
                }`}
              >
                <Icon className="h-3 w-3" />
                {s.label}
              </button>
            )
          })}
        </div>

        <div
          className="rounded-xl p-6 min-h-[70vh]"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <SectionContent />

          {/* Navegação entre seções */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border/40">
            {(() => {
              const idx = sections.findIndex(s => s.id === activeSection)
              const prev = sections[idx - 1]
              const next = sections[idx + 1]
              return (
                <>
                  <div>
                    {prev && (
                      <button
                        onClick={() => setActiveSection(prev.id)}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronRight className="h-4 w-4 rotate-180" />
                        {prev.label}
                      </button>
                    )}
                  </div>
                  <div>
                    {next && (
                      <button
                        onClick={() => setActiveSection(next.id)}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {next.label}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
