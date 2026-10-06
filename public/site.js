const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.site-nav');
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.textContent = open ? 'Cerrar −' : 'Menú +';
  navigation.classList.toggle('open', open);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
    menu.click();
    menu.focus();
  }
});
const examples = {
  hypothesis: ['Hipótesis', 'Una idea que se puede discutir.', 'La expansión de Vaca Muerta podría sostener producción e ingresos de las energéticas listadas. Falta comprobar capex, regulación y precios internacionales.'],
  evidence: ['Evidencia a buscar', 'Una pregunta concreta.', '¿YPF y Vista informan producción y capex alineados con la tesis? En tu espacio, cada revisión busca fuentes y separa hechos de interpretaciones.'],
  change: ['Criterio de revisión', 'Cambiar de opinión también cuenta.', 'Si los proyectos se frenan o el crédito se contrae, toca revisar la idea. Una caída del precio, por sí sola, no responde esa pregunta.'],
};
document.querySelectorAll('[data-example]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-example]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    const [label, title, copy] = examples[button.dataset.example];
    document.querySelector('#example-label').textContent = label;
    document.querySelector('#example-title').textContent = title;
    document.querySelector('#example-copy').textContent = copy;
  });
});
// Preserve bookmarked hash routes from the original app home.
function restoreAppBookmark() {
  if (location.pathname === '/' && location.hash.startsWith('#/')) location.replace('/app' + location.hash);
}
window.addEventListener('hashchange', restoreAppBookmark);
restoreAppBookmark();
