"""
Process Pill Box's event.   Check if the scheduled alarm event is met.  The alarm schedule time's range : 00:00:00 to 23:59:59

Last Updated: Feb 12, 2019

Author: Medium One

Alert the user's family and friends by sms if the user has not taken the medicine at the scheduled time.  


"""
#########################################  Detailed Explanation   #####################################################

#  Step 1: Read Alarm Schedule Array from the Setting stream
#
#  NUM: 1  (Alarm unique ID)
#  Time string: (UTC or zero time format)  "1970-01-01T23:29:00Z"   Only the time portion is evaulated by the code.

#  Step 2: Configure the status register for each alarm.   Check the alarm schedule array first.  Use default settings for initialization.
#
#  NUM: 1  (Alarm unique ID)
#  Enable (bit) : True  (False if the alarm is not created or the alarm has an empty time string.)
#  Checked (flag) : False  (Default is False.  Set true if the code has checked for door open/close status during the detection window.)
#  Medicine Taken (flag) : False (Default is False.  Set True if the medicine door has been opened duirng the detection window.)

#  Step 3: 15 minute Timer or Medicine door open/close input triggers the code to start processing.

# Normal cases (example 5am):  1. Need +/- 30 minute window to detect door open. 
#                              2. Need 30 min to process the stored flags for door open. (15 min timer is used.)

#        5 am
# |======^=======|-------|    
#   0.5hr   0.5hr   0.5hr 
# 4:30am       5:30am   6:00am
#
# Algorithm:
# The code starts to check whether the door is open or not at 4:30 am.  If the door has been open between 4:30am and 5:30am, 
# a medicine taken flag is set.  After 5:30am, a 15 minute timer will invoke the code to process the result.  if the flag
# is not set, an SMS text message is sent to alert the patient's family.


# Special cases: (examples where some time values are negative)

# An offset adjustment needed for an alarm set between 11:00pm and 12:30am (UTC or zero time zone.)
# becasue the alarm time window will cover negative time range relative to the zero time origin.   The code cannot work 
# with negative time values.  So, an offset is used to change the negative values into the positive values.

#  Here is a one day timeline.  
#  |------------------|-------------------------------------------------------------------------|
#                     0 sec                                                                    24 hr x 3600 sec/hr
#                     12:00am                                                                  12:00am

#   TIMEADJ_ALARM_LOW_SEC (lowest alarm set time case for offset adjustment) @ 11:00 am

#        11:00am     12:00 am
#  |======^======|-----|-----------------------------------------------------------------|
#     1 hour      0.5 hr 
#  |door detect | process
#  |~~~~~ 1.5 hour~~~~|  
#  0                 1.5 x 3600 sec                                                   22.5 x 3600 sec
#
#   TIMEADJ_ALARM_HIGH_SEC (highest alarm set time case for offset adjustment) @ 12:30 am

#                 12:00am   12:30am
#  |-------------------|=====^=====|------------------------------------------------------|
#                       0.5hr 0.5hr
#                      |door detect| process
#  |                         |
#  0                       2 x 3600 sec                                               22.5 x 3600 sec
#
################################################################################################################################

#########################################  Import Library Section  #####################################################
#
################################################################################################################################
import time
import Store
import datetime  
import DateConversion
import Store
import Analytics
import Store
import json

##############################################  Constant Variable Section  #####################################################
#
################################################################################################################################
MAX_NUM_OF_ALARMS = 10;  


HIGHEST_TIME_SEC      = 24 * 3600  # 24 hours x 3600 sec/hour 
LOWEST_TIME_SEC       = 0 

DETECT_TIME           = 1 * 3600   # 1 hour window  (1 hour x 3600 sec/hour)
TIMEADJ_OFFSET_SEC    = DETECT_TIME + 30 * 60   # 1) 1 hour for each alarm's door detection window.
                            # 2) Extra 30 minutes are needed to process the result of the door detectiond due to 15 min timer.
TIMEADJ_ALARM_LOW_SEC  =  HIGHEST_TIME_SEC - DETECT_TIME / 2 - 30 * 60  # half the detection time and 30 min from the origin point (HIGHEST TIME SEC).
TIMEADJ_ALARM_HIGH_SEC =  LOWEST_TIME_SEC + DETECT_TIME / 2   # half the detection time from the origin point(0 sec)


log (u'HIGHEST_TIME_SEC: {}'.format(HIGHEST_TIME_SEC))
log (u'LOWEST_TIME_SEC: {}'.format(LOWEST_TIME_SEC))
log (u'DETECT_TIME: {}'.format(DETECT_TIME))

log (u'TIMEADJ_OFFSET_SEC: {}'.format(TIMEADJ_OFFSET_SEC))

log (u'TIMEADJ_ALARM_LOW_SEC: {}'.format(TIMEADJ_ALARM_LOW_SEC))
log (u'TIMEADJ_ALARM_HIGH_SEC: {}'.format(TIMEADJ_ALARM_HIGH_SEC))

#########################################  Subroutine Declaration Section  #####################################################
#
################################################################################################################################

def read_json_from_global_store(key):
    data_json = Store.get_global(key)
    if data_json is None: 
        data_json = "[]"  # array of dictionary
    return json.loads(data_json)

def write_json_from_global_store(key,context_array):
    data_json = json.dumps(context_array)
    Store.set_global_data(key,data_json,-1)

def get_current_iso_time():
    dtnow = datetime.datetime.now()
    dtutcnow = datetime.datetime.utcnow()
    delta = dtnow - dtutcnow
    hh,mm = divmod((delta.days * 24*60*60 + delta.seconds + 30) // 60, 60)
    #log(hh)
    #log(mm)
    return "%s%+03d:%02d" % (dtnow.isoformat(), hh, mm)

# This function will extract the time portion only.   It will account
# for the offset time if needed.   
def get_time_in_secs(dt_str):
    dt_py_ts = DateConversion.to_py_datetime(dt_str)
    t_py_ts  = dt_py_ts.time()
    time_sec = t_py_ts.hour * 3600 + t_py_ts.minute * 60 + t_py_ts.second    
    offset_sec=dt_py_ts.utcoffset().total_seconds()
    eff_time = time_sec - offset_sec
    if (eff_time >= 24 * 3600):   # time cannot be greater than 24 hours.
                                  # T00:00Z  = 0.0
                                  # T16:00-08 = 24 * 3600  
        eff_time = eff_time - 24 * 3600
    return (eff_time)

def add_time_adjustment(ts_sec):
    new_ts_sec = ts_sec + TIMEADJ_OFFSET_SEC  
    if (new_ts_sec >= HIGHEST_TIME_SEC):     # Over 24 hour? 
        new_ts_sec = new_ts_sec - HIGHEST_TIME_SEC  # Yes.  Then subtract by 24 hour time
    return new_ts_sec

# output_event_template = {
#     "msg":          "Temperature exceeded a safe limit of 50 degrees",
#     "msg_type":     "Alert",                                        # May use other types in future
#     "device_name":  "Temperature Sensor E38",
#     "email":       ["bob@somewhere.com", "joe@somewhereelse.com"],  # optional, string or list of strings
#     "sms":         ["1234567890", "0987654321"],                    # optional, string or list of strings, 10-digit
#     "email_by_id": ["<uuid1>", "<uuid2>"],                          # optional, user_id to be looked up in Store
#     "sms_by_id":   ["<uuid1>", "<uuid1>"],                          # optional, user_id to be looked up in Store
# }
def send_sms_msg (sendalergmsg_flag):
    global alertmsg, msg_type, device_name, sms, no_phone_for_msg, device_id
    flag = sendalergmsg_flag
    if (flag and no_phone_for_msg == False): 
        msg_type    = "Alert"
        device_name = "Medicine Door Detection Sensor" + "(" + device_id + ")"
        msg_event = {"msg"      :   alertmsg, 
                    "msg_type"  :   msg_type,
                    "device_name"   :   device_name,
                    "sms"       : sms 
                    }
        log (msg_event)
        IONode.set_output("out1", msg_event)               

###############################  Global Variable Declaration and Initialization Section  #######################################
#  Implement Step 1 & Step 2
################################################################################################################################

# SMS related variables
sendalertmsg = False  # Flag set for sending alert message
alertmsg     = ""     # Alert Message 
sms          = []  # SMS phone numbers

# Alarm related variables
alarms_num   = []  # alarm schedule num
alarms       = []  # Scheduled alarm times
alarms_check_status = []  # array of status such as checked and door open status.

no_phone_for_msg = False # No phone number to send an SMS message
no_alarm_set     = False # No alarm set

# Get Device ID to check if this device is a valid device
device_id = IONode.get_input('in3')['event_data']['value']
log ("Device ID: {}".format(device_id))

if (device_id != None):
    alarms_check_status = read_json_from_global_store("alarms_check_status")    
    log (alarms_check_status)

    # Initialize the array if it is empty.
    if (len(alarms_check_status) == 0):
        for index in range(MAX_NUM_OF_ALARMS):
            schedule_dict_status = {"num":index+1, "enable": False, "checked":False, "med_taken_flag":False}
            alarms_check_status.append(schedule_dict_status)

    # Get the SMS phone numbers
    last_phone_values = Analytics.last_values(tag_names = ['settings.phones'], user=None)
    if len(last_phone_values) > 0:   
        phones_array = last_phone_values[0]['settings.phones']
        if (len(phones_array)):
            for index in range(len(phones_array)): 
                sms.append(phones_array[index].get('phone').replace("-",""))
        log (sms)   
        no_phone_for_msg = False
    else:
        log ("No phone number provided.")
        no_phone_for_msg = True
        
    # Get the alarm times
    last_alarm_values = Analytics.last_values(tag_names = ['settings.alarms'], user=None)
    if len(last_alarm_values) > 0: 
        alarms_array = last_alarm_values[0]['settings.alarms']
        if (len(alarms_array)):
            for index1 in range(len(alarms_array)): 
                if (alarms_array[index1].get('time') != None):    
                    alarms_num.append(alarms_array[index1].get('num'))
                    alarms.append(alarms_array[index1].get('time'))  
        log(alarms_num)        
        log(alarms) 
        no_alarm_set = False
    else:
        log("No scheduled alarm")
        no_alarm_set = True

    # Initialize the alarm status array.
    if (no_alarm_set == False):
        for index in range ((MAX_NUM_OF_ALARMS)):
            if (index+1 in alarms_num):
                alarms_check_status[index]['enable'] = True  # true or still true. Leave other flags' values unchanged.
            else:    
                alarms_check_status[index]['enable'] = False  # alarm is removed.
                alarms_check_status[index]['checked'] = False # clear the flag 
                alarms_check_status[index]['med_taken_flag'] = False  # clear the flag
        log(alarms_check_status);        

    # Get the current time
    current_ts      = get_current_iso_time()
    current_ts_sec  = get_time_in_secs(current_ts)    
    log (u'Current time stamp: {}'.format(current_ts))
    log (u'Current time in sec: {}'.format(current_ts_sec))

###############################################################   Main Body  #####################################################
#   Implement Step 3
#
#   Triggered by door open/close:  During the detection time window (alarm time +/- 30 min), the checked flag is set to True.
#                                  If the door is open, the medicine taken flag is set to True and a text message will be sent.
#
#   Triggered by timer:  Before the detection time window, always do nothing.
#                        During the detection time window, set the checked flag to True.
#                        Any time after the detection time window, verify the checked flag and the medicine taken flag. Send an
#                        a text message out according to the flag status.   Then reset both flags afterward.
#                      
#                        Case 1: Checked Flag = True.  Medicine Taken Flag = False.  Alert user that the medicine was not taken at
#                                                                                    the scheduled time.
#
#                        Case 2: Checked Flag = True.  Medicine Taken Flag = True.  Alert user that the medicine was taken on time at
#                                                                                    the scheduled time.
#
################################################################################################################################

if (IONode.get_input('in1')['trigger'] and device_id != None and no_alarm_set == False):  # Recieve an open/close event from the pill box    
    log (u'Triggered by door close flag = {}'.format(IONode.get_input('in1')['event_data']['value']))
    for num in range(MAX_NUM_OF_ALARMS):
        if (alarms_check_status[num]['enable'] == True):            
            log (u'Alarms # = {}'.format(num+1))
            alarm_ts_sec    = get_time_in_secs(alarms[alarms_num.index(num+1)])
            current_ts_sec  = get_time_in_secs(current_ts)     # restore the unadjusted time for the next alarm.
            # The alarm set between the below range of time which will need time adjustment to avoid negative times.  
            if ((0 <= alarm_ts_sec and alarm_ts_sec <= TIMEADJ_ALARM_HIGH_SEC) or (TIMEADJ_ALARM_LOW_SEC <= alarm_ts_sec and alarm_ts_sec <= HIGHEST_TIME_SEC)):
                log (u'Alarm timestamp: {}'.format(alarms[alarms_num.index(num+1)])) 
                log (u'Alarm time in sec): {}'.format(alarm_ts_sec))
                log (u'Time needs to be adjusted')
                alarm_ts_sec = add_time_adjustment(alarm_ts_sec)
                current_ts_sec = add_time_adjustment(current_ts_sec)               
            diff_sec        = abs(alarm_ts_sec - current_ts_sec)     
            log (u'Current time stamp: {}'.format(current_ts))
            log (u'Current time in sec: {}'.format(current_ts_sec))
            log (u'Alarm timestamp: {}'.format(alarms[alarms_num.index(num+1)])) 
            log (u'Alarm time in sec: {}'.format(alarm_ts_sec))
            log (u'diff in sec: {}'.format(diff_sec))
            if (current_ts_sec >= (alarm_ts_sec - DETECT_TIME/2)):  #  Need to check the time.                
                if (diff_sec <= DETECT_TIME/2):
                    log(u"Current time is during the alarm's check window. Checked flag = True")
                    alarms_check_status[num]['checked'] = True
                    if (IONode.get_input('in1')['event_data']['value'] == False and alarms_check_status[num]['med_taken_flag'] == False  ):  
                        log(u'Door is open.')
                        alarms_check_status[num]['med_taken_flag'] = True               
                        sendalertmsg = True
                        alertmsg = "Alarm #" + str(num+1) + ": Medicine was just taken."   # Send only for the first time.  For subsequent open trigger, no message will be sent.                                          
                        send_sms_msg (sendalertmsg)
                        sendalertmsg = False
elif (device_id != None and no_alarm_set == False):
    log (u'Triggered by 15 min timer.')
    for num in range(MAX_NUM_OF_ALARMS):
        if (alarms_check_status[num]['enable'] == True):   
            log (u'Alarms # = {}'.format(num+1))            
            alarm_ts_sec    = get_time_in_secs(alarms[alarms_num.index(num+1)])
            current_ts_sec  = get_time_in_secs(current_ts)     # restore the unadjusted time for the next alarm.
            # The alarm set between the below range of time which will need time adjustment to avoid negative times.  
            if ((0 <= alarm_ts_sec and alarm_ts_sec <= TIMEADJ_ALARM_HIGH_SEC) or (TIMEADJ_ALARM_LOW_SEC <= alarm_ts_sec and alarm_ts_sec <= HIGHEST_TIME_SEC)):
                log (u'Alarm timestamp: {}'.format(alarms[alarms_num.index(num+1)])) 
                log (u'Alarm time in sec): {}'.format(alarm_ts_sec))
                log (u'Time needs to be adjusted')
                alarm_ts_sec = add_time_adjustment(alarm_ts_sec)
                current_ts_sec = add_time_adjustment(current_ts_sec) 
            diff_sec        = abs(alarm_ts_sec - current_ts_sec)
            log (u'Current time stamp: {}'.format(current_ts))
            log (u'Current time in sec: {}'.format(current_ts_sec))
            log (u'Alarm timestamp: {}'.format(alarms[alarms_num.index(num+1)])) 
            log (u'Alarm time in sec: {}'.format(alarm_ts_sec))      
            log (u'diff in sec: {}'.format(diff_sec))
            if (current_ts_sec >= (alarm_ts_sec - DETECT_TIME/2)):  #  Need to check the time.                
                if (diff_sec <= DETECT_TIME/2):
                    log(u"Current time is during the alarm's check window. Checked flag = True")
                    alarms_check_status[num]['checked'] = True
                else:
                    log(u"Current time is after the alarm's check window.")
                    if (alarms_check_status[num]['checked'] == True):
                        if (alarms_check_status[num]['med_taken_flag'] == True):
                            log (u"It is taken on time.")
                            sendalertmsg = True
                            alertmsg = "Alarm #" + str(num+1) + ": Medicine was taken on time."     
                        else:
                            log (u"It is not taken yet.")        
                            sendalertmsg = True
                            alertmsg = "Alarm #" + str(num+1) + ": Medicine was not taken at the scheduled time."                                                               
                    alarms_check_status[num]['checked']             = False  # reset value
                    alarms_check_status[num]['med_taken_flag']  = False # reset value   
                    send_sms_msg (sendalertmsg)
                    sendalertmsg = False
            else:
                log(u"Current time is before the alarm's check window. No action.")

if (device_id != None and no_alarm_set == False):
    # save the changes
    write_json_from_global_store("alarms_check_status",alarms_check_status)
    alarms_check_status = read_json_from_global_store("alarms_check_status")    
    log (alarms_check_status)
                    
