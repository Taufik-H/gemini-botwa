const { makeWASocket, DisconnectReason, useMultiFileAuthState, generateWAMessageFromContent, prepareWAMessageMedia, generateThumbnail, getHttpStream, toBuffer } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { fromBuffer } = require('file-type');
const fs = require('fs');
const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require("@google/generative-ai");
require('dotenv').config()
const Snaptik = require('snaptik')

exports.parseMention = (text) => [...text.matchAll(/@?([0-9]{5,16}|0)/g)].map((v) => v[1] + S_WHATSAPP_NET);

const download = async (url, extension, optionsOverride = {}) => {
  try {
    const stream = await getHttpStream(url, optionsOverride);
    const buffer = await toBuffer(stream);
    const type = await fromBuffer(buffer);
    const filepath = `./temp/${new Date().getTime()}.${extension || type.ext}`;
    fs.writeFileSync(filepath, buffer.toString('binary'), 'binary');
    const nganu = {
      filepath,
      mimetype: type.mime,
    };
    return nganu;
  } catch (error) {
    console.log(error);
  }
};

async function sendFileFromUrl(sock, jid, url, caption = '', quoted = '', mentionedJid, extension, options = {}, axiosOptions = {}) {
  let unlink;
  try {
    await sock.presenceSubscribe(jid)
    const { filepath, mimetype } = await download(url, extension, axiosOptions);
    unlink = filepath
    mentionedJid = mentionedJid ? parseMention(mentionedJid) : []
    let mime = mimetype.split('/')[0]
    if (mimetype == 'image/gif' || options.gif) {
      const message = await prepareWAMessageMedia({ video: { url: filepath }, caption, gifPlayback: true, gifAttribution: 1, mentions: mentionedJid, ...options }, { upload: sock.waUploadToServer })
      let media = generateWAMessageFromContent(jid, { videoMessage: message.videoMessage }, { quoted, mediaUploadTimeoutMs: 600000 })
      fs.unlinkSync(filepath)
      return await sock.relayMessage(jid, media.message, { messageId: media.key.id })
    } else if (mime == 'video') {
      const message = await prepareWAMessageMedia({ video: { url: filepath }, caption, mentions: mentionedJid, ...options }, { upload: sock.waUploadToServer })
      let media = generateWAMessageFromContent(jid, { videoMessage: message.videoMessage }, { quoted, mediaUploadTimeoutMs: 600000 })
      fs.unlinkSync(filepath)
      return await sock.relayMessage(jid, media.message, { messageId: media.key.id })
    } else if (mime == 'image') {
      const message = await prepareWAMessageMedia({ image: { url: filepath }, caption, mentions: mentionedJid, ...options }, { upload: sock.waUploadToServer })
      let media = generateWAMessageFromContent(jid, { imageMessage: message.imageMessage }, { quoted, mediaUploadTimeoutMs: 600000 })
      fs.unlinkSync(filepath)
      return await sock.relayMessage(jid, media.message, { messageId: media.key.id })
    } else if (mime == 'audio') {
      await sock.sendPresenceUpdate('recording', jid)
      const message = await prepareWAMessageMedia({ document: { url: filepath }, mimetype: mimetype, fileName: options.fileName }, { upload: sock.waUploadToServer })
      let media = generateWAMessageFromContent(jid, { documentMessage: message.documentMessage }, { quoted, mediaUploadTimeoutMs: 600000 })
      fs.unlinkSync(filepath)
      return await sock.relayMessage(jid, media.message, { messageId: media.key.id })
    } else {
      const message = await prepareWAMessageMedia({ document: { url: filepath }, mimetype: mimetype, fileName: options.fileName }, { upload: sock.waUploadToServer, })
      let media = generateWAMessageFromContent(jid, { documentMessage: message.documentMessage }, { quoted, mediaUploadTimeoutMs: 600000 })
      fs.unlinkSync(filepath)
      return await sock.relayMessage(jid, media.message, { messageId: media.key.id })
    }

  } catch (error) {
    console.log(error)
    // unlink ? fs.unlinkSync(unlink) : ''
    // sock.sendMessage(jid, { text: `error nganu => ${util.format(error)} ` }, { quoted })
  }
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const sock = await makeWASocket({
    // buat authnya
    auth: state,
    // print QR in terminal
    printQRInTerminal: true,
    defaultQueryTimeoutMs: undefined
  })

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect.error = Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect)
      // reconnect if not logged out
      if (shouldReconnect) {
        connectToWhatsApp()
      }
    } else if (connection === 'open') {
      console.log('opened connection')
    }
  })
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on('messages.upsert', async (m) => {

    if (m.type === 'notify') {
      try {
        const senderNumber = m.messages[0].key.remoteJid;
        const senderName = m.messages[0].pushName;
        let incommingMessage = m.messages[0].message.conversation;
        // jika pesan dari grup
        const userIngroup = senderNumber.includes('@g.us');
        // jika user mention
        const userMentioned = incommingMessage.includes('6283842061886');


        console.log("Pesan masuk :", incommingMessage);
        console.log("Pengirim : ", senderName);
        console.log("Apakah pesan dari grup :", userIngroup)
        console.log("apakah user mentionku", userMentioned);
        // extended mesage
        if (m.messages[0].message.extendedTextMessage) {
          const extendedMessage = m.messages[0].message.extendedTextMessage;
          incommingMessage = extendedMessage.text;
          console.log("Pesan Ekstended :", incommingMessage);
        }


        if (!userIngroup && incommingMessage.includes('.gemini')) {
          try {
            // set prompt to stream and clear prompt
            const safetySettings = [
              {
                category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,

              },
              {
                category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
              },
              {
                category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
                threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
              },

            ];
            // konfig module
            const model = genAI.getGenerativeModel({ model: "gemini-pro" }, safetySettings);
            // simpan pesan history
            const chat = model.startChat({
              history: [],
              generationConfig: {
                maxOutputTokens: 500,
              }
            })

            const prompt = incommingMessage
            const clearPrompt = prompt.replace(/\.gemini|@628[0-9]{9}/g, '');
            const result = await chat.sendMessageStream(` ${clearPrompt}`)
            const response = await result.response;
            const text = response.text();
            const formatTextToMarkdownWa = text.replace(/\*\*(.+?)\*\*/g, "*$1*");
            console.log("Prompt :", clearPrompt)
            console.log(text);
            await sock.sendMessage(senderNumber, { text: formatTextToMarkdownWa }, { quoted: m.messages[0] }, 2000);

          } catch (error) {
            // console.error("Error:", error.response.promptFeedback);
            await sock.sendMessage(senderNumber, { text: 'sorry...try another question' }, { quoted: m.messages[0] }, 2000);

          }
        } else if (!userIngroup && incommingMessage.includes('.tiktok')) {
          try {
            sock.sendMessage(senderNumber, { text: '📲 Downloading...' }, { quoted: m.messages[0] }, 2000);
            const clearPrompt = incommingMessage.slice(8);
            const snaptik = new Snaptik(clearPrompt);
            const downsnaptik = await snaptik.download()
            if (downsnaptik.status == 200) {
              const linkvideo = downsnaptik.link_1
              const caption = `_Downloader Tiktok from @${downsnaptik.metadata.author_unique_id}_\nDescription : ${downsnaptik.metadata.title}`
              await sendFileFromUrl(sock, senderNumber, linkvideo, caption, m.messages[0], '', 'mp4')
            } else {
              await sock.sendMessage(senderNumber, { text: "Error Lur" }, { quoted: m.messages[0] }, 2000);
            }
          } catch (e) {
            console.log(e)
          }
        }
        // } if (userIngroup && incommingMessage.includes('@6283842061886') && incommingMessage.includes('/')) {
        //   run()
        // }
      } catch (error) {
        console.log(error)
        // connectToWhatsApp()
      }
    }
  })
}

connectToWhatsApp().catch((e) => {
  console.error(e)
})