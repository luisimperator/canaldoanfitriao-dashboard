// Ponte do Téo com a agenda do Google (Apps Script).
//
// O script cria (uma vez) a agenda "Calls Canal do Anfitrião (Téo)" na conta
// e coloca lá cada call marcada pelo Téo, com Meet, convidando o lead e o
// vendedor.
//
// Como instalar (na conta Google onde a agenda vai ficar):
// 1. script.google.com → Novo projeto → apague tudo e cole este arquivo.
// 2. Troque TOKEN por uma senha longa qualquer (a mesma que vai no Supabase).
// 3. Menu "Serviços" (+) → "Google Calendar API" → Adicionar.
// 4. No topo, escolha a função "instalar" e clique em Executar. Autorize o
//    acesso à agenda. Isso cria a agenda nova.
// 5. Implantar → Nova implantação → engrenagem → "App da Web".
//    Executar como: Eu · Quem pode acessar: Qualquer pessoa → Implantar.
//    Copie a URL do app da web.
// 6. No SQL Editor do Supabase:
//    select vault.create_secret('URL_DO_APP', 'teo_agenda_url');
//    select vault.create_secret('O_MESMO_TOKEN', 'teo_agenda_token');

const TOKEN = 'TROQUE_POR_UMA_SENHA_LONGA';
const NOME_AGENDA = 'Calls Canal do Anfitrião (Téo)';

function agenda_() {
  const props = PropertiesService.getScriptProperties();
  const salvo = props.getProperty('AGENDA_ID');
  if (salvo && CalendarApp.getCalendarById(salvo)) return salvo;
  const achadas = CalendarApp.getCalendarsByName(NOME_AGENDA);
  const cal = achadas.length ? achadas[0] : CalendarApp.createCalendar(NOME_AGENDA, { timeZone: 'America/Sao_Paulo' });
  props.setProperty('AGENDA_ID', cal.getId());
  return cal.getId();
}

// Rode uma vez pelo editor: autoriza e cria a agenda.
function instalar() {
  Logger.log('Agenda pronta: ' + agenda_());
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.token !== TOKEN) return json_({ ok: false, erro: 'token inválido' });
    const ev = Calendar.Events.insert(
      {
        summary: b.titulo,
        description: b.descricao || '',
        start: { dateTime: b.inicio, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: b.fim, timeZone: 'America/Sao_Paulo' },
        attendees: (b.convidados || []).map(function (email) { return { email: email }; }),
        conferenceData: {
          createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
        },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }, { method: 'email', minutes: 60 }] },
      },
      agenda_(),
      { conferenceDataVersion: 1, sendUpdates: 'all' }
    );
    return json_({ ok: true, id: ev.id, meet: ev.hangoutLink || '', link: ev.htmlLink || '' });
  } catch (err) {
    return json_({ ok: false, erro: String(err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
