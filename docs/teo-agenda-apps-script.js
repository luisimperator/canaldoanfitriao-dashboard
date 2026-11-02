// Ponte do Téo com a agenda do Google (Apps Script).
//
// Como instalar (na conta Google dona da agenda):
// 1. script.google.com → Novo projeto → apague tudo e cole este arquivo.
// 2. Troque TOKEN por uma senha longa qualquer (a mesma que vai no Supabase).
// 3. Menu "Serviços" (+) → "Google Calendar API" → Adicionar.
// 4. Implantar → Nova implantação → engrenagem → "App da Web".
//    Executar como: Eu · Quem pode acessar: Qualquer pessoa → Implantar.
//    Autorize o acesso à agenda e copie a URL do app da web.
// 5. No SQL Editor do Supabase:
//    select vault.create_secret('URL_DO_APP', 'teo_agenda_url');
//    select vault.create_secret('O_MESMO_TOKEN', 'teo_agenda_token');

const TOKEN = 'TROQUE_POR_UMA_SENHA_LONGA';

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
      'primary',
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
