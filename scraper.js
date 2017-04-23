/***************** GLOBAL VARIABLES ****************/
var steps = [];
var fs = require('fs')
var step_index = 0;
var step_complete = true;
var debugging = true;
var verbose_dbg = false;
var download_everything = true;
var watch_for_new = true;
var watch_interval = (1000 * 60 * 15 ) // every 15 minutes
var time_skew = 20 // minutes subtracted from date so we don't miss purchases. recommend watch_interval + 5 (purchase date might not be the same as time it updates db)
var last_update = "2016-12-01T00:00:00.000Z"
// example: 2016-01-15T20:00:00.000Z
// 2017-01-22T24:11:55.927Z
var webPage = require('webpage');
var output_dir = "/storage/music/"
var last_update_file = output_dir+".last_update"
var downloaded_objects_file = output_dir+".downloaded_objects"
var downloaded_objects = []
var page = webPage.create();
var album_count = 0;
var cookies_for_import = { ".amazon.com" : '' }
var header_tracker = {}
var client_info = {}
l("Initializing...")
/***************** CONFIGURATIONS ****************/
user_agent = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.157 Safari/537.36';
page.settings.userAgent = user_agent;
page.settings.javascriptEnabled = true;
page.settings.loadImages = false;//Script is much faster with this field set to false  
phantom.cookiesEnabled = true;
phantom.javascriptEnabled = true;
add_cookies(cookies_for_import);

/** load from cache files **/
load_update_time()
load_downloaded_objects()

page.onConsoleMessage = function(msg) {
    debug(msg);
};

page.onResourceRequested = function (request) {

  if(verbose_dbg) { 
    debug('Request ' + JSON.stringify(request, undefined, 4));
  }
  r_header = request["headers"]
  for (i=0; i<r_header.length; i++) {
    cur_header = r_header[i]
    header_tracker[cur_header["name"]] = cur_header["value"]
  }
  if(request["postData"]) {
    cur_post = JSON.parse(request["postData"])
    cur_post_keys = Object.keys(cur_post)
    for(i=0; i<cur_post_keys.length;i++) {
      client_info[cur_post_keys[i]] = cur_post[cur_post_keys[i]]
    }
  }
};

page.onResourceReceived = function(response) {
  if(verbose_dbg) {
    debug('Response (#' + response.id + ', stage "' + response.stage + '"): ' + JSON.stringify(response));
  }
};


page.onLoadStarted = function() {
    debug('Loading started');
};
page.onLoadFinished = function() {
    debug('Loading finished');
};
page.onError = function (msg, trace) {
    debug(msg);
    trace.forEach(function(item) {
        debug('  ', item.file, ':', item.line);
    });
};

page.onInitialized = function() {
  page.customHeaders = {};
};

/***************** HELPER FUNCTIONS ****************/

/*
 * debug(s)
 * Prints debugging message to the console
 * adds "#" to front of lines
 */

function debug(s) {
  if(debugging) {
    console.log("#" + s.replace(/\n/g,"\n#"))
  }
}

/*
 * function l(s)
 * logs string to console
 */
function l(s) {
  console.log(Date() + ":" + s)
}

/*
 * update_time()
 * uses a 15 time skew to account for delays
 */

function update_time() {
  m = function(x) {x++;if(x<10) { return "0"+x; } else { return x } }
  f = function(x) {if(x<10) { return "0"+x; } else { return x } }
  t = new Date()
  t.setMinutes(t.getMinutes() - time_skew)
  last_update = t.getUTCFullYear()+ "-" + m(t.getUTCMonth()) + "-" + t.getUTCDate() + "T"+f(t.getUTCHours()) + ":" + f(t.getUTCMinutes()) + ":" + f(t.getUTCSeconds()) + "." +  t.getUTCMilliseconds() + "Z"; 
}

/*
 * save_update_time()
 *
 */



function save_update_time() {
  var fs = require('fs')
  if(fs.isWritable(last_update_file)) {
    fs.write(last_update_file, last_update,'w')
  } else {
    debug(last_update_file +" is not writeable")
  }
}


/*
 * load_update_time()
 *
 */

function load_update_time() {
  var fs = require('fs')
  if(fs.isReadable(last_update_file)) {
    contents = fs.read(last_update_file)
    if(contents != "") {
      last_update = contents.replace(/\n/g,"")
    }
  }
}


/*
 * save_downloaded_objects()
 *
 */



function save_downloaded_objects() {
  var fs = require('fs')
  if(fs.isWritable(downloaded_objects_file)) {
    fs.write(downloaded_objects_file, JSON.stringify(downloaded_objects),'w')
  }
}


/*
 * load_downloaded_objects()
 *
 */

function load_downloaded_objects() {
  var fs = require('fs')
  if(fs.isReadable(downloaded_objects_file)) {
    contents = fs.read(downloaded_objects_file)
    if(contents != "") {
      downloaded_objects = JSON.parse(contents)
    }
  }
}


/*
 * add_cookies(c)
 * Expecting cookie to be a dict of domain:cookies_string
 * Example: { ".example.com" : "name1=val1; name2=val2" }
 */

function add_cookies(c) {
  for(i=0; i<Object.keys(c).length; i++) {
    domain = Object.keys(c)[i]
    cur_cookies = c[domain].split("; ")
    for (j=0; j<cur_cookies.length;j++) {
      name = cur_cookies[j].split("=")[0]
      val = cur_cookies[j].split("=")[1]
      newcookie = {
        'name'  : name,
        'value' : val,
        'domain': domain,
        'path'  : '/',
        'httponly' : false,
        'secure' : true,
        'expires'  : (new Date()).getTime() + (1000 * 60 * 60 * 24 *365 * 1)   
      }
      if(phantom.addCookie(newcookie))
        debug("adding cookie:\n "+JSON.stringify(newcookie))
    }
  }

}

/* 
 * step_through_requests()
 * Walks through all the requests functions.
 */
function step_through_requests() {
  if(typeof steps[step_index] != "function" && step_complete == true) {
    l("Completed execution.")
    save_downloaded_objects()
    phantom.exit()
  } else if (step_complete == true) {
    step_complete = false;
    steps[step_index]();
    step_index++;
  }
}


/*
 * format_fields(field)
 * phantomjs is not properly handling utf8 in the reply data. this is a workaround fail gracefully. 
 * replaces nonascii with a wildcard. may result in getting more than just one albumb.
 */

function format_fields(field) {
  new_field = ""
  for (i=0;i<field.length;i++) {
    c = field.charCodeAt(i)
    if (c == 32 ) {
      new_field += '+'
    } else if (c == 43) {
      new_field += "%2B"
    } else if (c >= 32 && c < 126) {
      new_field += field[i]
    } else {
      new_field += "%25"
      break
    } 
  }
  return new_field
}

/*
 * build_amazon_query(details)
 *
 */

function build_amazon_query(details) {
  customer_data = "&customerInfo.customerId="+client_info["customerId"]+"&customerInfo.deviceId="+client_info["deviceId"]+"&customerInfo.deviceType="+client_info["deviceType"]
  query = ""

// ########## query for all songs ###############
  if (details == "all_songs") {
    //all songs query
    query = "searchReturnType=ALBUMS&searchCriteria.member.1.attributeName=status&searchCriteria.member.1.comparisonType=EQUALS&searchCriteria.member.1.attributeValue=AVAILABLE&searchCriteria.member.2.attributeName=trackStatus&searchCriteria.member.2.comparisonType=IS_NULL&searchCriteria.member.2.attributeValue=&sortCriteriaList=&countOnly=true&Operation=searchLibrary&caller=getAllDataCountByMetaType&ContentType=JSON"
// ########## query album info by id ########
  } else if(details["type"] == "album_by_id") {
    id = details["id"]
    query = "searchReturnType=ALBUMS&searchCriteria.member.1.attributeName=status&searchCriteria.member.1.comparisonType=EQUALS&searchCriteria.member.1.attributeValue=AVAILABLE&searchCriteria.member.2.attributeName=trackStatus&searchCriteria.member.2.comparisonType=IS_NULL&searchCriteria.member.2.attributeValue=&albumArtUrlsSizeList.member.1=MEDIUM&selectedColumns.member.1=albumArtistName&selectedColumns.member.2=albumName&selectedColumns.member.3=artistName&selectedColumns.member.4=objectId&selectedColumns.member.5=primaryGenre&selectedColumns.member.6=sortAlbumArtistName&selectedColumns.member.7=sortAlbumName&selectedColumns.member.8=sortArtistName&selectedColumns.member.9=albumCoverImageMedium&selectedColumns.member.10=albumAsin&selectedColumns.member.11=artistAsin&selectedColumns.member.12=gracenoteId&selectedColumns.member.13=physicalOrderId&sortCriteriaList=&maxResults=1&nextResultsToken="+(id)+"&Operation=searchLibrary&caller=getAllDataByMetaType&sortCriteriaList.member.1.sortColumn=sortAlbumName&sortCriteriaList.member.1.sortType=ASC&ContentType=JSON"
// ########## query for latest songs ############
  } else if(details["type"] == "latest") {
  last = details["last_update"]
  if(details["offset"]) 
    offset = details["offset"]
  else
    offset = ""
  debug("querybuilder offset is: " +offset)
  query = "selectCriteria=&albumArtUrlsRedirects=false&distinctOnly=false&countOnly=false&sortCriteriaList=&maxResults=50&nextResultsToken="+offset+"&Operation=selectTrackMetadata&caller=getServerSmartList&selectedColumns.member.1=albumArtistName&selectedColumns.member.2=albumAsin&selectedColumns.member.3=albumName&selectedColumns.member.4=albumReleaseDate&selectedColumns.member.5=artistAsin&selectedColumns.member.6=artistName&selectedColumns.member.7=asin&selectedColumns.member.8=assetType&selectedColumns.member.9=creationDate&selectedColumns.member.10=discNum&selectedColumns.member.11=duration&selectedColumns.member.12=extension&selectedColumns.member.13=purchased&selectedColumns.member.14=lastUpdatedDate&selectedColumns.member.15=name&selectedColumns.member.16=objectId&selectedColumns.member.17=orderId&selectedColumns.member.18=primaryGenre&selectedColumns.member.19=purchaseDate&selectedColumns.member.20=size&selectedColumns.member.21=sortAlbumArtistName&selectedColumns.member.22=sortAlbumName&selectedColumns.member.23=sortArtistName&selectedColumns.member.24=sortTitle&selectedColumns.member.25=status&selectedColumns.member.26=title&selectedColumns.member.27=trackNum&selectedColumns.member.28=trackStatus&selectedColumns.member.29=payerId&selectedColumns.member.30=physicalOrderId&selectedColumns.member.31=primeStatus&selectedColumns.member.32=purchased&selectedColumns.member.33=uploaded&selectedColumns.member.34=instantImport&selectedColumns.member.35=isMusicSubscription&selectCriteriaList.member.1.attributeName=status&selectCriteriaList.member.1.comparisonType=EQUALS&selectCriteriaList.member.1.attributeValue=AVAILABLE&selectCriteriaList.member.2.attributeName=creationDate&selectCriteriaList.member.2.comparisonType=GREATER_THAN&selectCriteriaList.member.2.attributeValue="+last+"&selectCriteriaList.member.3.attributeName=purchased&selectCriteriaList.member.3.comparisonType=EQUALS&selectCriteriaList.member.3.attributeValue=TRUE&sortCriteriaList.member.1.sortColumn=creationDate&sortCriteriaList.member.1.sortType=DESC&ContentType=JSON"

// ########## query for single album ############
  } else if(details["type"] == "single_album") {
    album = details["album_name"]
    if(details["album_term"]) {
      album_term = details["album_term"]
    } else if (album=="%2B") {
      album_term = "EQUALS"
    } else {
      album_term = "LIKE"
    }
    artist = details["artist_name"]
    if(details["artist_term"]) {
      artist_term = details["artist_term"]
    } else if (artist=="%2B") {
      artist_term = "EQUALS"
    } else {
      artist_term = "LIKE"
    }
    query = "selectCriteriaList.member.1.attributeName=status&selectCriteriaList.member.1.comparisonType=EQUALS&selectCriteriaList.member.1.attributeValue=AVAILABLE&selectCriteriaList.member.2.attributeName=trackStatus&selectCriteriaList.member.2.comparisonType=IS_NULL&selectCriteriaList.member.2.attributeValue=&selectCriteriaList.member.3.attributeName=sortAlbumArtistName&selectCriteriaList.member.3.comparisonType="+artist_term+"&selectCriteriaList.member.3.attributeValue="+artist+"&selectCriteriaList.member.4.attributeName=sortAlbumName&selectCriteriaList.member.4.comparisonType="+album_term+"&selectCriteriaList.member.4.attributeValue="+album+"&selectCriteriaList.member.5.attributeName=purchased&selectCriteriaList.member.5.comparisonType=EQUALS&selectCriteriaList.member.5.attributeValue=true&sortCriteriaList=&albumArtUrlsSizeList.member.1=FULL&albumArtUrlsSizeList.member.2=LARGE&albumArtUrlsRedirects=false&maxResults=500&nextResultsToken=0&Operation=selectTrackMetadata&distinctOnly=false&countOnly=false&caller=getServerData&selectedColumns.member.1=albumArtistName&selectedColumns.member.2=albumAsin&selectedColumns.member.3=albumName&selectedColumns.member.4=albumReleaseDate&selectedColumns.member.5=artistAsin&selectedColumns.member.6=artistName&selectedColumns.member.7=asin&selectedColumns.member.8=assetType&selectedColumns.member.9=creationDate&selectedColumns.member.10=discNum&selectedColumns.member.11=duration&selectedColumns.member.12=extension&selectedColumns.member.13=purchased&selectedColumns.member.14=lastUpdatedDate&selectedColumns.member.15=name&selectedColumns.member.16=objectId&selectedColumns.member.17=orderId&selectedColumns.member.18=primaryGenre&selectedColumns.member.19=purchaseDate&selectedColumns.member.20=size&selectedColumns.member.21=sortAlbumArtistName&selectedColumns.member.22=sortAlbumName&selectedColumns.member.23=sortArtistName&selectedColumns.member.24=sortTitle&selectedColumns.member.25=status&selectedColumns.member.26=title&selectedColumns.member.27=trackNum&selectedColumns.member.28=trackStatus&selectedColumns.member.29=payerId&selectedColumns.member.30=physicalOrderId&selectedColumns.member.31=primeStatus&selectedColumns.member.32=purchased&selectedColumns.member.33=uploaded&selectedColumns.member.34=instantImport&selectedColumns.member.35=isMusicSubscription&sortCriteriaList.member.1.sortColumn=discNum&sortCriteriaList.member.1.sortType=ASC&sortCriteriaList.member.2.sortColumn=trackNum&sortCriteriaList.member.2.sortType=ASC&ContentType=JSON"
  }
  return query+customer_data
}

/*
 * do_amazon_custom_headers(cur_page)
 * sets headers up for the next request
 */
function do_amazon_custom_headers(cur_page) {
    cur_page.customHeaders = {
      "Origin" : header_tracker["Origin"],
      "csrf-rnd" : header_tracker["csrf-rnd"],
      "Content-Encoding" : header_tracker["Content-Encoding"],
      "Accept" : "application/json, text/javascript, */*; q=0.01",
      "csrf-token" : header_tracker["csrf-token"],
      "Referer" : "https://music.amazon.com/home",
      "csrf-ts" : header_tracker["csrf-ts"],
      "x-amzn-RequestId" : header_tracker["x-amzn-RequestId"],
      "X-Requested-With" : "XMLHttpRequest",
      "Referer" : "https://music.amazon.com/my/songs"
    };
}


/* 
 * query_and_download(id)
 * Queries amazon for a specific album id, grabs all of its song ids, and then downloads them and saves into a single zip.
 */
function query_latest(offset) {
  l("checking for new songs")
  do_amazon_custom_headers(page)
  url = "https://music.amazon.com/cirrus/"
  debug("i see last update: " + last_update)
  settings = {"type" : "latest", "last_update" : last_update }
  if (typeof offset != "undefined") {
    debug("offset is" + offset)
    settings["offset"] = offset
  }
  data = build_amazon_query(settings)
  page.open(url, 'post', data, function(status) {
    if (status !== 'success') {
      debug("Error, unsuccessful update query gave status: "+status) 
    } else {
      response = page.plainText;
      debug("got data: "+response)
      response = JSON.parse(response)
      if(response["selectTrackMetadataResponse"] && response["selectTrackMetadataResponse"]["selectTrackMetadataResult"] && response["selectTrackMetadataResponse"]["selectTrackMetadataResult"]["resultCount"]) {
        if(response["selectTrackMetadataResponse"]["selectTrackMetadataResult"]["nextResultsToken"] != null) {
          steps.push( (function(x) { return function() { query_latest(x); }; })(response["selectTrackMetadataResponse"]["selectTrackMetadataResult"]["nextResultsToken"]) )
        } else {
          update_time()
          save_update_time();

        }       
        track_list = response["selectTrackMetadataResponse"]["selectTrackMetadataResult"]["trackInfoList"]
        trackIds = parse_track_info_list(track_list)
        debug(JSON.stringify(trackIds))
        if(trackIds.length > 0 ) { 
          l("downloading " + tracksId.length + " tracks")
          download_tracks_list(trackIds,"lastest_songs_"+last_update)
        }
      } else debug("didn't expect this back from the server")
    }
  });

}


/*
 * parse_track_info_list(info_list) 
 */

function parse_track_info_list(info_list) {
  trackIds = Array()
  tracklist = info_list
  for (i=0;i<tracklist.length;i++) {
    cur_track = tracklist[i]["metadata"]["objectId"]
    if(tracklist[i]["metadata"]["purchased"] == "true" && downloaded_objects.indexOf(cur_track) == -1) {
      trackIds.push(cur_track)
    } else {
      debug("not downloading track "+i+", already downloaded")
    }
  }
  return trackIds
}

/*
 * download(download_url,album_name,after)
 * download_url: url to download
 * album_name: file is stored to album_name+".zip"
 */
function download(download_url,album_name, tracks) {
  l("Downloading album: "+album_name)
  debug("downloading via curl")
  var process = require("child_process")
  spawn = process.spawn
  var execFile = process.execFile
  cmd = "curl"
  cmd_options = [download_url, "-o", output_dir+album_name+".zip", "-H", "User-Agent: "+user_agent, "-H", "Referer: https://music.amazon.com/"]
  debug(cmd+ " " + cmd_options.join(" "))
  var curl = spawn(cmd, cmd_options)
  curl.stdout.on("data", function (data) {
    debug("curlSTDOUT: "+ JSON.stringify(data))
  })

  curl.stderr.on("data", function (data) {
    debug("curlSTDERR: "+JSON.stringify(data))
  })

  curl.on("exit", function (code) {
    
    debug("curlEXIT: " + code)
    if(code == 0) {
      unzip = spawn("unzip", ["-o", output_dir+album_name+".zip","-d", output_dir])
      unzip.stdout.on("data", function(data) { debug("unzipSTDOUT: " + JSON.stringify(data)) });
      unzip.stderr.on("data", function(data) { debug("unzipSTDERR: " + JSON.stringify(data)) });
      unzip.on("exit", function(code) { 
        if(code == 0) { 
          rm = spawn("rm", [output_dir+album_name+".zip", "-f"])
          rm.stdout.on("data", function(data) { debug("rmSTDOUT: " + JSON.stringify(data))})
          rm.stderr.on("data", function(data) { debug("rmSTDERR: " + JSON.stringify(data))})
          rm.on("exit", function(code) { debug("rmEXIT: " + JSON.stringify(code))})
        }
        downloaded_objects = downloaded_objects.concat(tracks) 
        save_downloaded_objects();       
        steps.push( function() { 
          step_complete = false; 
        });
        l("successful download!")
        step_complete = true
        debug("unzipEXIT: " +code);
      });
    }
  });  
  debug("done curling this set")
}
function query_and_download(id){
    /*

    Query and download album

    */
    l('Querying An Album with id:' +id)
    do_amazon_custom_headers(page)
    url = "https://music.amazon.com/cirrus/"
    data = build_amazon_query({"type" : "album_by_id", "id" : String(id)})
    page.open(url, 'post', data, function(status) {
      if (status !== 'success') {
        debug("Error, unsuccessful step "+ step_index+" gave status: "+status) 
        step_complete = true
      } else {
        response = page.plainText;
        debug("got data: "+response)
        response = JSON.parse(response)
        if (response["searchLibraryResponse"] && response["searchLibraryResponse"]["searchLibraryResult"] && response["searchLibraryResponse"]["searchLibraryResult"]["resultCount"] == 1) {
          this_item = response["searchLibraryResponse"]["searchLibraryResult"]["searchReturnItemList"][0]
          artist_name = format_fields(this_item["metadata"]["sortAlbumArtistName"])
          album_name = format_fields(this_item["metadata"]["sortAlbumName"])
          debug("artist name is: "+artist_name + " and album name is: "+album_name)
          do_amazon_custom_headers(page)
          url = "https://music.amazon.com/cirrus/"
          data = build_amazon_query({"type": "single_album", "album_name" : album_name, "artist_name" : artist_name })
          debug("sending data:"+data)
          page.open(url, 'post', data, function(status) {
            if (status !== 'success') {
              debug("Error, unsuccessful step "+ step_index+" gave status: "+status)
              step_complete = true
            } else {
              response = page.plainText;
              //debug("got data: "+response)
              response = JSON.parse(response)
              if (response["selectTrackMetadataResponse"] && response["selectTrackMetadataResponse"]["selectTrackMetadataResult"]) {
                result = response["selectTrackMetadataResponse"]["selectTrackMetadataResult"];
                debug("got result count: "+result["resultCount"])
                trackIds = parse_track_info_list(result["trackInfoList"])
                debug("trackIds:"+JSON.stringify(trackIds))
                if(trackIds.length <1) {
                  step_complete = true
                  return 
                }
                download_tracks_list(trackIds,album_name)
              } else {
                debug("did not get response i was expecting")
              }
            }
          });
          
        } else {
          debug("did not get response i was expecting")
        }
      }
    });
  }

/*
 * download_tracks_list(track_ids) 
 * track_ids: array of object ids to download
 */
function download_tracks_list(track_ids,album_name) {
  do_amazon_custom_headers(page)
  url="https://music.amazon.com/gp/dmusic/modalPurchasing/zipDownload?ObjectIdList="+track_ids.join(",")
  page.open(url, function(status){
    debug("access status:" +status)
    download_url = page.evaluate(function() { return document.getElementById("zipDownloadIframe").src; } );
    debug(download_url)
    download(download_url,album_name, track_ids )
  });
}

/*
 *  query_all_music() 
 *
 */
function query_all_music(){
  /*

  Query for the total number of albums in the library

  */
  l('Querying songs list.')
  do_amazon_custom_headers(page)
  url = "https://music.amazon.com/cirrus/"
  data = build_amazon_query("all_songs")
  page.open(url, 'post', data, function(status) {
    if (status !== 'success') {
      debug("Error, unsuccessful step "+ step_index+" gave status: "+status) 
    } else {
      response = page.plainText;
      debug("got data: "+response)
      response = JSON.parse(response)
      if(response["searchLibraryResponse"] && response["searchLibraryResponse"]["searchLibraryResult"] && response["searchLibraryResponse"]["searchLibraryResult"]["resultCount"]) {
        album_count = response["searchLibraryResponse"]["searchLibraryResult"]["resultCount"]
        debug("parsed album_count to: "+ album_count)
        
      } else {
        debug("could not find album count")
      }
      
    }
    step_complete = true
  });
}



/***************** STEP FUNCTIONS ****************/
steps = [
  function(){
    l('Accessing Amazon Music.');
    page.open("https://music.amazon.com/", function(status){
      debug("access status:" +status)
     if(debugging) {
        debug("saving render to step"+step_index+".png");
        page.render("step"+step_index+".png");
      }
    setTimeout(
      function() { step_complete = true; 
    }, 10000)
    })
  },
  function() {
    if(download_everything) {
      l('Going to try to download all the things.')
      query_all_music();
    } else step_complete = true
  },
  function(){
    /*

    Query/download each album iteratively

    */
    if(download_everything) {
      debug("going through albums")
      for(i=0; i<album_count;i++) {
        steps.push((function(x) {
          return function() { query_and_download(x); };
        })(i) );
      }
    }
    if(watch_for_new) {
      steps.push( function() { l("Going into watcher mode"); step_complete = true; })
      steps.push( function() { 
        query_latest(); 
        setInterval(query_latest,watch_interval); 
      });
    }
     
  step_complete = true
  },


]


/***************** BEGIN ****************/
if (! fs.isExecutable(output_dir)) { 
  debug("I can't write to my working dir:"+output_dir + "\nI can't do anything until this is fixed.")
  phantom.exit(1)
} else {
  fs.touch(last_update_file)
  fs.touch(downloaded_objects_file)
}

l('All settings loaded, start with execution');
interval = setInterval(step_through_requests,100);

