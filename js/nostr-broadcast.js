// button click handler
const fetchAndBroadcast = async () => {
  // reset UI
  $('#fetching-status').html('')
  $('#fetching-progress').css('visibility', 'hidden')
  $('#fetching-progress').val(0)
  $('#file-download').html('')
  $('#events-found').text('')
  $('#broadcasting-status').html('')
  $('#broadcasting-progress').css('visibility', 'hidden')
  $('#broadcasting-progress').val(0)
  // messages to show to user
  const checkMark = '&#10003;'
  const txt = {
    broadcasting: 'Broadcasting to relays... ',
    fetching: 'Fetching from relays... ',
    download: `Downloading Backup file... ${checkMark}`,
  }

  // parse pubkey ('npub' or hexa)
  const relaySet = parseRelaySet($('#relaySet').val())
  const pubkey = parsePubkey($('#pubkey').val())
  if (!pubkey) return
  // disable button (will be re-enable at the end of the process)
  $('#fetch-and-broadcast').prop('disabled', true)
  $('#just-broadcast').prop('disabled', true)
  // inform user that app is fetching from relays
  $('#fetching-status').text(txt.fetching)
  // show and update fetching progress bar
  $('#fetching-progress').css('visibility', 'visible')
  $('#fetching-progress').prop('max', relays.length)

  $('#checking-relays-header-box').css('display', 'flex')
  $('#checking-relays-box').css('display', 'flex')
  $('#checking-relays-header').html("<th>Relay</th><th>Status</th><th>From Key</th><th>About Key</th><th>Events</th>")

  // get all events from relays
  const filters =[{ authors: [pubkey] }, { "#p": [pubkey] }]

  let date = new Date();
  let offset = date.getTimezoneOffset() * 60;

  const startDate = Date.parse($('#startDate').val())
  const endDate = Date.parse($('#endDate').val())

  const addedFilters = {
    since: Math.floor((startDate - startDate % 864e5) / 1000) + offset, // 0:00
    until: Math.floor((endDate - endDate % 864e5 + 864e5 - 1) / 1000) + offset // 23:59
  }

  const data = (await getEvents(filters, addedFilters, pubkey, relaySet)).sort((a, b) => b.created_at - a.created_at)

  // inform user fetching is done
  $('#fetching-status').html(txt.fetching + checkMark)
  $('#fetching-progress').val(relays.length)

  const latestKind3 = data.filter((it) => it.kind == 3 && it.pubkey === pubkey)[0]  

  $('#checking-relays-header-box').css('display', 'none')
  $('#checking-relays-box').css('display', 'none')
  // inform user that backup file (js format) is being downloaded

  $('#file-download').html(txt.download)
  downloadFile(data, 'nostr-backup.json')

  if (latestKind3) {
    const myRelaySet = JSON.parse(latestKind3.content)
    relays = Object.keys(myRelaySet).filter(url => myRelaySet[url].write).map(url => url)

    // inform user that app is broadcasting events to relays
    $('#broadcasting-status').html(txt.broadcasting)
    // show and update broadcasting progress bar
    $('#broadcasting-progress').css('visibility', 'visible')
    $('#broadcasting-progress').prop('max', relays.length)
    
    $('#checking-relays-header-box').css('display', 'flex')
    $('#checking-relays-box').css('display', 'flex')
    $('#checking-relays-header').html("<th>Relay</th><th>Status</th><th>From Key</th><th>About Key</th><th>Events</th>")
  
    await broadcastEvents(data)
  }

  // inform user that broadcasting is done
  $('#broadcasting-status').html(txt.broadcasting + checkMark)
  $('#broadcasting-progress').val(relays.length)
  // re-enable broadcast button
  $('#fetch-and-broadcast').prop('disabled', false)
}

const getFromExtension = async () => {
  const pubkey = await window.nostr.getPublicKey()
  if (pubkey) $('#pubkey').val(pubkey).change()
}

const pubkeyOnChange = () => {
  $('#fetch-and-broadcast').css('display', '')
  $('#get-from-extension').css('display', 'none')
}

if (window.nostr) {
  $('#fetch-and-broadcast').css('display', 'none')
  $('#get-from-extension').css('display', '')
}

// button click handler
const justBroadcast = async (fileName) => {
  const reader = new FileReader();
  reader.addEventListener('load', (event) => {
    var data = JSON.parse(event.target.result)
    broadcast(data)
  });
  reader.readAsText(fileName)
}

const broadcast = async (data) => {
  console.log(data)
  // reset UI
  $('#fetching-status').html('')
  $('#fetching-progress').css('visibility', 'hidden')
  $('#fetching-progress').val(0)
  $('#file-download').html('')
  $('#events-found').text('')
  $('#broadcasting-status').html('')
  $('#broadcasting-progress').css('visibility', 'hidden')
  $('#broadcasting-progress').val(0)
  // messages to show to user
  const checkMark = '&#10003;'
  const txt = {
    broadcasting: 'Broadcasting to relays... ',
    fetching: 'Loading from file... ',
    download: `Downloading Backup file... ${checkMark}`,
  }
  // disable button (will be re-enable at the end of the process)
  $('#fetch-and-broadcast').prop('disabled', true)
  $('#just-broadcast').prop('disabled', true)
  // show and update fetching progress bar
  $('#fetching-progress').css('visibility', 'visible')
  $('#fetching-progress').prop('max', relays.length)

  // inform user fetching is done
  $('#fetching-status').html(txt.fetching + checkMark)
  $('#fetching-progress').val(relays.length)

  const latestKind3 = data.filter((it) => it.kind == 3)[0]  
  const myRelaySet = JSON.parse(latestKind3.content)
  relays = Object.keys(myRelaySet).filter(url => myRelaySet[url].write).map(url => url)

  $('#checking-relays-header-box').css('display', 'none')
  $('#checking-relays-box').css('display', 'none')

  // inform user that app is broadcasting events to relays
  $('#broadcasting-status').html(txt.broadcasting)
  // show and update broadcasting progress bar
  $('#broadcasting-progress').css('visibility', 'visible')
  $('#broadcasting-progress').prop('max', relays.length)
  
  $('#checking-relays-header-box').css('display', 'flex')
  $('#checking-relays-box').css('display', 'flex')
  $('#checking-relays-header').html("<th>Relay</th><th>Status</th><th>From Key</th><th>About Key</th><th>Events</th>")

  await broadcastEvents(data)

  // inform user that broadcasting is done
  $('#broadcasting-status').html(txt.broadcasting + checkMark)
  $('#broadcasting-progress').val(relays.length)
  // re-enable broadcast button
  $('#fetch-and-broadcast').prop('disabled', false)
}