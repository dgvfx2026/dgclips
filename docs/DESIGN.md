# DGCLIPS — Midnight Liquid Glass

Interpretação web das referências fornecidas pelo proprietário: fundo preto/azul profundo, luz azul no alto, violeta e âmbar na lateral e cards com bordas finas e material translúcido. Os controles têm formato de cápsula, reflexos superiores e luz na borda inferior. A inspiração é visual; a implementação usa CSS e Motion para a web.

- Dock flutuante com ícones, estado ativo luminoso e nomes acessíveis.
- Dashboard em composição bento, com biblioteca e passos de criação abaixo.
- Blur, refração de luz na posição do ponteiro, inclinação discreta dos cards e sombras internas.
- Animações de entrada com atraso progressivo e revelação por IntersectionObserver durante o scroll.
- Ícones com reação ao hover, botões com efeito de pressão, reflexos em movimento e prévias flutuantes.
- Luzes ambientes animadas com Motion e contadores com transição numérica.
- Layout adaptado ao celular, com menu expansível e formulário rolável.
- A preferência `prefers-reduced-motion` desativa os movimentos contínuos, a inclinação e as entradas. O conteúdo permanece visível.

Os contadores usam os projetos reais da conta ou os exemplos identificados da demonstração. As pequenas linhas luminosas dos cards são elementos decorativos, não séries históricas de desempenho.

Materiais: `frontend/src/components/dgclips/liquid-glass.css`.
Movimento: `frontend/src/components/dgclips/glass-motion.tsx`.
