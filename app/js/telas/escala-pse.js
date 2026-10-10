// Escala de PSE do projeto (referência para professores e alunos): a mesma usada para responder.

import { h } from '../util.js';
import { escalaPse, INSTRUCAO_PSE } from '../pse.js';

export async function render(caixa) {
  caixa.append(
    h('div', null, h('a', { class: 'voltar', href: '#/', onclick: e => { if (history.length > 1) { e.preventDefault(); history.back(); } } }, '← Voltar')),
    h('div', { class: 'cabeca' }, h('div', null,
      h('span', { class: 'lbl', text: 'Percepção subjetiva do esforço · natação' }),
      h('h2', { text: 'Escala de PSE' }))),
    h('div', { class: 'card' },
      h('p', { class: 'dica', text: INSTRUCAO_PSE }),
      escalaPse({ exemplos: true })),
    h('div', { class: 'card' },
      h('h3', { text: 'Como o app usa a PSE' }),
      h('ul', { class: 'lista-texto' },
        h('li', { text: 'Uma resposta por aluno por treino. Quem responde por último vale (o aluno no próprio celular ou o professor na beira da piscina).' }),
        h('li', { text: 'O professor marca ao tocar em "Encerrar treino" ou no resumo do treino. O aluno responde em "Meus treinos".' }),
        h('li', { text: 'Carga do treino = PSE × duração em minutos (unidades arbitrárias). Ex.: PSE 6 numa aula de 50 min = 300.' }),
        h('li', { text: 'A média da PSE de cada semana aparece no planejamento, ao lado da intensidade planejada.' }))));
}
