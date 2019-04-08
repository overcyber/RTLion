$(document).ready(scannerSocket);

var scan_namespace = '/graph';
var ping_pong_times = [];
var graph_active = true;
var start_time;
var n_read;
var center_freq;
var current_freq, min_freq, max_freq;
var freq_res = [], db_res = [];
var step_size;
var socket;

function pageInit(){
    $('#colScanner').hide();
    $('form#formStartScan').submit(formStartScan_submit);
    $('form#formDisconnect').submit(formDisconnect_submit);
    $('#formSaveSettings *').filter(':input').change(formSaveSettings_change);
    $('#inpFreqMax').keypress(inputKeyPress);
    $('#inpFreqMin').keypress(inputKeyPress);
    $('#inpDevIndex').keypress(inputKeyPress);
    $('#inpSampRate').keypress(inputKeyPress);
    $('#inpInterval').keypress(inputKeyPress);
    $('#rngScanSensivity').attr('min', 1);
    $('#rngScanSensivity').attr('max', 10);
    $('#rngScanSensivity').val(3);
    $('#rngScanSensivity').on('input', rngScanSensivity_input);
}
function formStartScan_submit(event){
    if (graph_active){
        checkRange();
        step_size = 2 * Math.pow(10, parseInt(Math.log10(max_freq-min_freq)-1));
        current_freq = parseInt($('#inpFreqMin').val());
        $('#spnFreqRange').text(min_freq + "-" + max_freq);
        $('#divScanResults').text("");
        freq_res = [];
        db_res = [];
        socket.emit('start_scan', current_freq);
    }else{
        current_freq = max_freq;
    }
    return false;
}
function formDisconnect_submit(event){
    socket.emit('disconnect_request');
    on_log_message("Disconnecting...")
    setTimeout(function() {
        location.reload();
    }, 2000);
    return false;
}
function formSaveSettings_change(){
    var args = {
        'dev': parseInt($('#inpDevIndex').val()), 
        'samprate': parseInt($('#inpSampRate').val()), 
        'gain': $('#inpDevGain').val(), 
        'freq': parseInt($('#inpFreqMin').val()),
        'n': n_read,
        'i': parseInt($('#inpInterval').val())
    };
    if(checkArgs(args)){
        socket.emit('update_settings', args);
    }else{
        socket.emit('send_cli_args');
    }
}
function rngScanSensivity_input(){
    
}
function inputKeyPress(evt){
    var charCode = (evt.which) ? evt.which : event.keyCode
    if (charCode > 31 && (charCode < 48 || charCode > 57))
        return false;
    return true;
}
function checkRange(){
    min_freq = parseInt($('#inpFreqMin').val());
    max_freq = parseInt($('#inpFreqMax').val());
    if(max_freq > min_freq)
        return true;
    return false;
}
function setRange(freq){
    $('#inpFreqMin').val(parseInt(+freq - (freq/5)));
    $('#inpFreqMax').val(parseInt(+freq + (freq/5)));
}
function checkArgs(args){
    if (args['dev'] < 0 || args['dev'] > 20 || args['samprate'] < 0 || 
    args['gain'] < 0  || args['i'] < 0 || !checkRange()){
        on_log_message("Invalid settings detected.");
        $('#spnSettingsLog').text('Invalid settings detected.');
        setTimeout(function() {
            $('#spnSettingsLog').text('');
        }, 1000);
        $('#btnStartScan').prop("disabled", true);
        return false;
    }
    $('#btnStartScan').prop("disabled", false);
    return true;
}
function on_log_message(msg){
    current_time = new Date().toLocaleTimeString().split(' ')[0];
    $('#divLog').append("<b>[" + current_time + "]</b> " + msg + "<br>");
    $('#divLog').scrollTop($('#divLog').height());
}
function on_freq_received(freqs, dbs){
    for (var i = 0; i < freqs.length; i++){
        var freq = freqs[i].toFixed(1);
        var db = dbs[i].toFixed(2);
        if(freq_res.indexOf(freq) == -1){
            freq_res.push(freq);
            db_res.push(db);
            $('#divScanResults').append(freq + "<br>");
        }
    }
}
function calc_threshold(){
    var db_sum = 0;
    for(var i = 0; i < db_res.length; i++){
        db_sum += parseInt(db_res[i]);
    }
    var db_avg = db_sum/db_res.length;
    $('#divScanResults').text("");
    for (var i = 0; i < freq_res.length; i++){
        if(Math.abs(db_res[i]) > Math.abs(db_avg/2))
            $('#divScanResults').append(freq_res[i] + "<br>");
    }

}
function scannerSocket(){
    pageInit();
    socket = io.connect(location.protocol + '//' + document.domain + 
                 ':' + location.port + scan_namespace);

    socket.on('connect', function() {
        socket.emit('send_cli_args');
    });

    socket.on('log_message', function(log) {
        on_log_message(log.msg);   
    });

    socket.on('dev_status', function(status) {
        if(parseInt(status) == 0){
            $('#formSaveSettings :input').prop('disabled', false);
            $('#formDisconnect :input').prop('disabled', false);
            graph_active = true;
            $('#btnStartScan').val("Start Scan");            
        }else if(parseInt(status) == 1) {
            $('#formSaveSettings :input').prop('disabled', true);
            $('#formDisconnect :input').prop('disabled', true);
            graph_active = false;
            $('#btnStartScan').val("Stop Scan");
        }
    });

    socket.on('graph_data', function(data) {
        $('#imgFreqScan').attr("src", "data:image/png;base64," + data.fft);
        on_freq_received(data.freqs, data.dbs);
        if(!$('#colScanner').is(':visible'))
            $('#colScanner').show();
        current_freq += step_size;
        if(current_freq<max_freq){
            socket.emit('restart_sdr', current_freq);
        }else{
            socket.emit('stop_sdr');
            calc_threshold();
        }
    });

    socket.on('new_freq_set', function(status) {
        socket.emit('start_sdr', -1);
    });

    socket.on('cli_args', function(cliargs) {
        var args = cliargs.args;
        for (var i in args){
            if (i != 'freq')
                args[i] = args[i] || 0;
        }
        checkArgs(args);
        $("#inpDevIndex").val(args.dev);
        $("#inpSampRate").val(args.samprate);
        $("#inpDevGain").val(args.gain);
        $("#inpInterval").val(args.i);
        center_freq = args.freq;
        n_read = args.n;
        if (cliargs.status == 1){
            $('#spnSettingsLog').text('Settings saved.');
            setTimeout(function() {
                $('#spnSettingsLog').text('');
            }, 1000);
        }else{
            if(center_freq > 0)
                setRange(center_freq);
        }
    });

    socket.on('server_pong', function() {
        var latency = (new Date).getTime() - start_time;
        ping_pong_times.push(latency);
        ping_pong_times = ping_pong_times.slice(-30);11
        var sum = 0;
        for (var i = 0; i < ping_pong_times.length; i++)
            sum += ping_pong_times[i];
        $('#spnPingPong').text(Math.round(10 * sum / ping_pong_times.length) / 10 + "ms");
    });
    
    window.setInterval(function() {
        start_time = (new Date).getTime();
        socket.emit('server_ping');
    }, 1000);
}