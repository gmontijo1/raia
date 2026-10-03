// Mostra um código de convite pronto para mandar: copiar ou enviar pelo WhatsApp.

import { h, aviso, dataCurta, isoLocal } from './util.js';
import { formatarCodigo } from './nuvem.js';

const ENDERECO = 'https://gmontijo1.github.io/raia/';
const TIPO = { aluno: 'aluno', professor: 'professor', master: 'master' };

export function mensagemConvite(codigo, papel, expiraEm) {
  const vale = expiraEm ? ` O código vale até ${dataCurta(isoLocal(new Date(expiraEm)))}.` : '';
  return `Seu acesso de ${TIPO[papel] || papel} no Raia: entre em ${ENDERECO} com a sua conta Google e digite o código ${formatarCodigo(codigo)}.${vale}`;
}

export function caixaCodigo({ codigo, papel, para, expiraEm }) {
  const msg = mensagemConvite(codigo, papel, expiraEm);
  const copiar = h('button', { class: 'btn', type: 'button' }, 'Copiar mensagem');
  copiar.addEventListener('click', () => {
    try {
      navigator.clipboard.writeText(msg).then(() => aviso('Mensagem copiada.'), () => aviso('Não deu para copiar. Selecione o texto e copie.'));
    } catch (e) { aviso('Não deu para copiar. Selecione o texto e copie.'); }
  });
  return h('div', { class: 'caixa-codigo' },
    h('span', { class: 'lbl', text: `Código de ${TIPO[papel] || papel}${para ? ` · ${para}` : ''}` }),
    h('span', { class: 'codigo', text: formatarCodigo(codigo) }),
    h('p', { class: 'sub mensagem', text: msg }),
    h('div', { class: 'acoes' },
      copiar,
      h('a', { class: 'btn primario', href: `https://wa.me/?text=${encodeURIComponent(msg)}`, target: '_blank', rel: 'noopener' }, 'Enviar pelo WhatsApp')),
    h('p', { class: 'sub', text: 'O código só funciona uma vez. Se a pessoa perder, gere outro.' }));
}
