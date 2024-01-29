// from https://github.com/paulmillr/noble-secp256k1/blob/main/index.ts#L803
function hexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('hexToBytes: expected string, got ' + typeof hex)
  }
  if (hex.length % 2)
    throw new Error('hexToBytes: received invalid unpadded hex' + hex.length)
  const array = new Uint8Array(hex.length / 2)
  for (let i = 0; i < array.length; i++) {
    const j = i * 2
    const hexByte = hex.slice(j, j + 2)
    const byte = Number.parseInt(hexByte, 16)
    if (Number.isNaN(byte) || byte < 0) throw new Error('Invalid byte sequence')
    array[i] = byte
  }
  return array
}

// decode nip19 ('npub') to hex
const npub2hexa = (npub) => {
  let { prefix, words } = bech32.bech32.decode(npub, 90)
  if (prefix === 'npub') {
    let data = new Uint8Array(bech32.bech32.fromWords(words))
    return buffer.Buffer.from(data).toString('hex')
  }
}
  
// encode hex to nip19 ('npub')
const hexa2npub = (hex) => {
  const data = hexToBytes(hex)
  const words = bech32.bech32.toWords(data)
  const prefix = 'npub'
  return bech32.bech32.encode(prefix, words, 90)
}
  
// parse inserted pubkey
const parsePubkey = (pubkey) =>
  pubkey.match('npub1') ? npub2hexa(pubkey) : pubkey

const parseRelaySet = (commaSeparatedRelayString) => {
  let list = commaSeparatedRelayString.split(",")

  if (list.length == 0) return undefined
  if (list.length == 1 && list[0].trim() === "") return undefined
  
  return list
}

// download js file
const downloadFile = (data, fileName) => {
  const prettyJs = JSON.stringify(data, null, 2)
  const tempLink = document.createElement('a')
  const taBlob = new Blob([prettyJs], { type: 'text/json' })
  tempLink.setAttribute('href', URL.createObjectURL(taBlob))
  tempLink.setAttribute('download', fileName)
  tempLink.click()
}

const updateRelayStatus = (relay, status, addToCount, subscription, until, message, relayStatusAndCount) => {
  if (relayStatusAndCount[relay] == undefined) {
    relayStatusAndCount[relay] = {}
  }

  if (status)
    relayStatusAndCount[relay].status = status

  if (!relayStatusAndCount[relay].until) {
    relayStatusAndCount[relay].until = {}
  }

  if (subscription)
    relayStatusAndCount[relay].until[subscription] = until

  if (message)
    relayStatusAndCount[relay].message = message

  if (relayStatusAndCount[relay].count != undefined) 
    relayStatusAndCount[relay].count = relayStatusAndCount[relay].count + addToCount
  else 
    relayStatusAndCount[relay].count = addToCount

  displayRelayStatus(relayStatusAndCount)
}

const displayRelayStatus = (relayStatusAndCount) => {
  if (Object.keys(relayStatusAndCount).length > 0) {
    Object.keys(relayStatusAndCount).forEach(
      it => {
        let untilStr = "";

        if (relayStatusAndCount[it].until) {
          if (relayStatusAndCount[it].until["my-sub-0"])
            untilStr += "<td> <" + new Date(relayStatusAndCount[it].until["my-sub-0"] * 1000).toLocaleDateString("en-US") + "</td>"
          else
            untilStr += "<td> </td>"

          if (relayStatusAndCount[it].until["my-sub-1"])
            untilStr += "<td> <" + new Date(relayStatusAndCount[it].until["my-sub-1"] * 1000).toLocaleDateString("en-US") + "</td>"
          else
            untilStr += "<td> </td>"
        } else {
          untilStr += "<td> </td> <td> </td>"
        }

        let msg = ""

        if (relayStatusAndCount[it].message)
          msg = relayStatusAndCount[it].message
          
        const relayName = it.replace("wss://", "").replace("ws://", "")  
        const line = "<td>" + relayName + "</td><td>" + relayStatusAndCount[it].status + "</td>" + untilStr + "<td>" + relayStatusAndCount[it].count + "</td>" + "<td>" + msg + "</td>"

        const elemId = relayName.replaceAll(".", "-")

        if ($('#' + elemId).length > 0) {
          $('#' + elemId).html(line)
        } else {
          $('#checking-relays').append(
            $("<tr>" +line+ "</tr>").attr('id', elemId)
          )
        }
      }
    )
  } else {
    $('#checking-relays-header').html("")
    $('#checking-relays').html("<tr id=\"checking-relays-header\"></tr>")
  }
}

// fetch events from relay, returns a promise
const fetchFromRelay = async (relay, filters, addedFilters, pubkey, events, relayStatus) =>
  new Promise((resolve, reject) => {
    try {
      updateRelayStatus(relay, "Starting", 0, undefined, undefined, undefined, relayStatus)
      // open websocket
      const ws = new WebSocket(relay)

      let isAuthenticating = false

      // prevent hanging forever
      let myTimeout = setTimeout(() => {
        ws.close()
        reject(relay)
      }, 10_000)

      const subscriptions = Object.fromEntries(filters.map ( (filter, index) => {
        let id = "my-sub-"+index

        let myFilter = filter

        if (!myFilter.since && addedFilters.since) {
          myFilter.since = addedFilters.since
        }
        if (!myFilter.until && addedFilters.until) {
          myFilter.until = addedFilters.until
        }

        return [ 
          id, {
            id: id,
            counter: 0,
            lastEvent: null,
            done: false,
            filter: myFilter,
            eventIds: new Set()
          }
        ]
      }))
      
      // subscribe to events filtered by author
      ws.onopen = () => {
        clearTimeout(myTimeout)
        myTimeout = setTimeout(() => {
          ws.close()
          reject(relay)
        }, 10_000)
        updateRelayStatus(relay, "Downloading", 0, undefined, undefined, undefined, relayStatus)
        
        for (const [key, sub] of Object.entries(subscriptions)) {
          ws.send(JSON.stringify(['REQ', sub.id, sub.filter]))
        }
      }

      // Listen for messages
      ws.onmessage = (event) => {
        const [msgType, subscriptionId, data] = JSON.parse(event.data)
        // event messages
        if (msgType === 'EVENT') {
          clearTimeout(myTimeout)
          myTimeout = setTimeout(() => {
            ws.close()
            reject(relay)
          }, 10_000)

          try { 
            const { id } = data

            if (addedFilters.since && data.created_at < addedFilters.since) return
            if (addedFilters.until && data.created_at > addedFilters.until) return

            if (!subscriptions[subscriptionId].lastEvent || data.created_at < subscriptions[subscriptionId].lastEvent.created_at)
            subscriptions[subscriptionId].lastEvent = data

            if (data.id in subscriptions[subscriptionId].eventIds) return

            subscriptions[subscriptionId].eventIds.add(data.id)
            subscriptions[subscriptionId].counter++

            // don't save/reboradcast kind 3s that are not from the author. 
            // their are too big. 
            if (data.kind == 3 && data.pubkey != pubkey) {
              return
            }

            let until = undefined

            if (subscriptions[subscriptionId].lastEvent) {
                until = subscriptions[subscriptionId].lastEvent.created_at
            }

            updateRelayStatus(relay, undefined, 1, subscriptionId, until, undefined, relayStatus)

            // prevent duplicated events
            if (events[id]) return
            else events[id] = data

            // show how many events were found until this moment
            $('#events-found').text(`${Object.keys(events).length} events found`)
          } catch(err) {
            console.log(err, event)
            return
          }
        }

        // end of subscription messages
        if (msgType === 'EOSE') {
          // Restarting the filter is necessary to go around Max Limits for each relay. 
          if (subscriptions[subscriptionId].counter < 2) { 
            subscriptions[subscriptionId].done = true
            
            let alldone = Object.values(subscriptions).every(filter => filter.done === true);
            if (alldone) {
              updateRelayStatus(relay, "Done", 0, undefined, undefined, undefined, relayStatus)
              ws.close()
              resolve(relay)
            }
          } else {
            //console.log("Limit: ", { ...filters[0], until: lastSub1Event.created_at })
            subscriptions[subscriptionId].counter = 0
            let newFilter = { ...subscriptions[subscriptionId].filter }
            newFilter.until = subscriptions[subscriptionId].lastEvent.created_at
            ws.send(JSON.stringify(['REQ', subscriptions[subscriptionId].id, newFilter]))
          }
        }

        if (msgType === 'AUTH') {
          isAuthenticating = true
          signNostrAuthEvent(relay, subscriptionId).then(
            (event) => {
              if (event) {
                ws.send(JSON.stringify(['AUTH', event]))
              } else {
                updateRelayStatus(relay, "AUTH Req", 0, undefined, undefined, relayStatus)
                ws.close()
                reject(relay)
              }
            },
            (reason) => {
              updateRelayStatus(relay, "AUTH Req", 0, undefined, undefined, relayStatus)
              ws.close()
              reject(relay)
            },
          ) 
        }

        if (msgType === 'CLOSED' && !isAuthenticating) {
          subscriptions[subscriptionId].done = true
        
          let alldone = Object.values(subscriptions).every(filter => filter.done === true);
          if (alldone) {
            updateRelayStatus(relay, "Done", 0, undefined, undefined, undefined, relayStatus)
            ws.close()
            resolve(relay)
          }
        }

        if (msgType === 'OK') {
          isAuthenticating = false
          // auth ok.
          for (const [key, sub] of Object.entries(subscriptions)) {
            ws.send(JSON.stringify(['REQ', sub.id, sub.filter]))
          }
        }
      }
      ws.onerror = (err) => {
        updateRelayStatus(relay, "Done", 0, undefined, undefined, undefined, relayStatus)
        try {
          ws.close()
          reject(relay)
        } catch {
          reject(relay)
        }
      }
      ws.onclose = (socket, event) => {
        updateRelayStatus(relay, "Done", 0, undefined, undefined, undefined, relayStatus)
        resolve(relay)
      }
    } catch (exception) {
      console.log(exception)
      updateRelayStatus(relay, "Error", 0, undefined, undefined, undefined, relayStatus)
      try {
        ws.close()
      } catch (exception) {
      }
      
      reject(relay)
    }
  })

// query relays for events published by this pubkey
const getEvents = async (filters, addedFilters, pubkey, relaySet) => {
  // events hash
  const events = {}

  let myRelaySet = null
  
  if (relaySet && relaySet.length > 0) 
    myRelaySet = relaySet 
  else 
    myRelaySet = relays

  // batch processing of 10 relays
  await processInPool(myRelaySet, (relay, poolStatus) => fetchFromRelay(relay, filters, addedFilters, pubkey, events, poolStatus), 10, (progress) => $('#fetching-progress').val(progress))

  displayRelayStatus({})

  // return data as an array of events
  return Object.keys(events).map((id) => events[id])
}

// broadcast events to list of relays
const broadcastEvents = async (data) => {
  const poolStatus = await processInPool(relays, (relay, poolStatus) => sendToRelay(relay, data, poolStatus), 10, (progress) => $('#broadcasting-progress').val(progress))

  displayRelayStatus(relayStatus)
}

const processInPool = async (items, processItem, poolSize, onProgress) => {
  let pool = {};
  let poolStatus = {}
  let remaining = [...items]
  
  while (remaining.length) {
    let processing = remaining.splice(0, 1)
    let item = processing[0]
    pool[item] = processItem(item, poolStatus);
      
    if (Object.keys(pool).length > poolSize - 1) {
      try {
        const resolvedId = await Promise.race(Object.values(pool)); // wait for one Promise to finish

        delete pool[resolvedId]; // remove that Promise from the pool
      } catch (resolvedId) {
        delete pool[resolvedId]; // remove that Promise from the pool
      }
    }

    onProgress(items.length - remaining.length)
  }

  await Promise.allSettled(Object.values(pool));

  return poolStatus
}

const sendAllEvents = async (relay, data, relayStatus, ws) => {
  console.log("Sending:", data.length, " events")
  for (evnt of data) {
    ws.send(JSON.stringify(['EVENT', evnt]))
  }
}

// send events to a relay, returns a promisse
const sendToRelay = async (relay, data, relayStatus) =>
  new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(relay)

      updateRelayStatus(relay, "Starting", 0, undefined, undefined, undefined, relayStatus)

      // prevent hanging forever
      let myTimeout = setTimeout(() => {
        ws.close()
        reject('timeout')
      }, 10_000)

      // fetch events from relay
      ws.onopen = () => {
        updateRelayStatus(relay, "Sending", 0, undefined, undefined, undefined, relayStatus)

        clearTimeout(myTimeout)
        myTimeout = setTimeout(() => {
          ws.close()
          reject('timeout')
        }, 10_000)

        sendAllEvents(relay, data, relayStatus, ws)
      }
      // Listen for messages
      ws.onmessage = (event) => {
        clearTimeout(myTimeout)
        myTimeout = setTimeout(() => {
          ws.close()
          reject('timeout')
        }, 10_000)

        const [msgType, subscriptionId, inserted, message] = JSON.parse(event.data)
        // event messages
        // end of subscription messages
        if (msgType === 'OK') {
          if (inserted == true) {
            updateRelayStatus(relay, undefined, 1, undefined, undefined, message, relayStatus)
          } else {
            updateRelayStatus(relay, undefined, 0, undefined, undefined, message, relayStatus)
            //console.log(relay, event.data)
          }
        } else {
          console.log(relay, event.data)
        }
      }
      ws.onerror = (err) => {
        updateRelayStatus(relay, "Error", 0, undefined, undefined, undefined, relayStatus)
        console.log("Error", err)
        ws.close()
        reject(err)
      }
      ws.onclose = (socket, event) => {
        updateRelayStatus(relay, "Done", 0, undefined, undefined, undefined, relayStatus)
        console.log("OnClose", relayStatus)
        resolve()
      }
    } catch (exception) {
      console.log(exception)
      updateRelayStatus(relay, "Error", 0, undefined, undefined, undefined, relayStatus)
      try {
        ws.close()
      } catch (exception) {
      }
      reject(exception)
    }
  })

async function generateNostrEventId(msg) {
  const digest = [
      0,
      msg.pubkey,
      msg.created_at,
      msg.kind,
      msg.tags,
      msg.content,
  ];
  const digest_str = JSON.stringify(digest);
  const hash = await sha256Hex(digest_str);

  return hash;
}

function sha256Hex(string) {
  const utf8 = new TextEncoder().encode(string);

  return crypto.subtle.digest('SHA-256', utf8).then((hashBuffer) => {
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map((bytes) => bytes.toString(16).padStart(2, '0'))
        .join('');

      return hashHex;
  });
}

async function signNostrAuthEvent(relay, auth_challenge) {
  try {
    let msg = {
        kind: 22242, 
        content: "",
        tags: [
          ["relay", relay],
          ["challenge", auth_challenge]
        ],
    };

    // set msg fields
    msg.created_at = Math.floor((new Date()).getTime() / 1000);
    msg.pubkey = await window.nostr.getPublicKey();

    // Generate event id
    msg.id = await generateNostrEventId(msg);

    // Sign event
    signed_msg = await window.nostr.signEvent(msg);
  } catch (e) {
    console.log("Failed to sign message with browser extension", e);
    return undefined;
  }

  return signed_msg;
}