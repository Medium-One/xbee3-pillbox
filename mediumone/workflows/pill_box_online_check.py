"""
Process Pill Box's event.  Set device online/offline status with time stamp.

Last Updated: Feb 5, 2019

Author: Medium One

Alert users by sms if the pill box is not sending the event out.  The box's board may not
be functioning correctly due to connectivity or power failure.


"""

#########################################  Import Library Section  #####################################################
#
################################################################################################################################

import time
import Store
import Analytics

OFFLINE_TIME_MAX    = 30*60   # 30 minutes > 15 min timer
DOOR_OPEN_TIME_MAX  = 30*60   # 30 minutes > 15 min timer
#########################################  Subroutine Declaration Section  #####################################################
#
################################################################################################################################
def read_str_from_global_store(key):
    data = Store.get_global(key)
    if data is None: 
        data = 'unknown'
    else:
        data = str(data)
    return data

def read_data_from_global_store(key):
    data = Store.get_global(key)
    if data is None: 
        data = -1
    return data

def write_data_to_global_store(key,data):
    Store.set_global_data(key,str(data),-1)

###############################  Global Variable Declaration and Initialization Section  #######################################
#  
################################################################################################################################

# SMS related variables
sendalertmsg = False  # Flag set for sending alert message
alertmsg     = ""     # Alert Message 
sms          = []  # SMS phone numbers
no_phone_for_msg = False # No phone number to send an SMS message

# Get Device ID to check if this device is a valid device
device_id = IONode.get_input('in3')['event_data']['value']
log ("Device ID: {}".format(device_id))

if (device_id != None):
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

    # Initialized to default values if the store has not have these variables.
    dev_status = read_str_from_global_store("dev_status")  
    if (dev_status == 'unknown'):
        log (u"Initialize dev_status")
        dev_status = 'offline'
        current_ts = time.time()
        write_data_to_global_store("dev_status", dev_status)
    
    last_ts = float(read_data_from_global_store("last_ts"))      
    if (last_ts == -1):
        log (u"Initialize last_ts")
        last_ts = time.time()
        write_data_to_global_store("last_ts", current_ts)
    
    door_open_last_ts = float(read_data_from_global_store("door_open_last_ts"))    
    if (door_open_last_ts == -1):  
        log (u"Initialize door_open_last_ts")
        door_open_last_ts = time.time()
        write_data_to_global_store("door_open_last_ts", current_ts)

    door_open_msg_out = read_str_from_global_store("door_open_msg_out")   # a flag to indicate whether warning msg was sent or not.
    if (door_open_msg_out == 'unknown'):
        log (u"Initialize door_open_msg_out")
        door_open_msg_out = 'false'
        write_data_to_global_store("door_open_msg_out", dev_status)        
        
    log (u"dev_status: {}".format(dev_status))       
    log (u"last_ts: {}".format(last_ts))
    log (u"door_open_last_ts: {}".format(door_open_last_ts))
    log (u"door_open_msg_out: {}".format(door_open_msg_out)) 
    current_ts = time.time()
    log (u"Current time: {}".format(current_ts))
    log (u"=================================")
###############################################################   Main Body  #####################################################
#
################################################################################################################################


if (IONode.get_input('in1')['trigger'] and device_id != None):  # Recieve an door open/close event from the pill box
    log (u'Open/close event triggered')
    if (dev_status == 'offline'):    
        log(u"Change the device status from offline to online.")
        log(u"Set stored values to online and update the time stamp:")
        dev_status = 'online';
        log (u"Device status: {} (save current time in last_ts).".format(dev_status))            
        write_data_to_global_store("dev_status", dev_status)
        write_data_to_global_store("last_ts", current_ts)
        write_data_to_global_store("door_open_last_ts", current_ts)   # reset the time
        door_open_msg_out = 'false'                                   # reset to 'false.'
        write_data_to_global_store("door_open_msg_out", door_open_msg_out)           
        sendalertmsg = True 
        alertmsg = "Device came back online again."
    else:
        log(u"It is already online.  Only update the time stamp value.")        
        log (u"Update the time stamp only:")
        write_data_to_global_store("last_ts", current_ts)
        # Check if the door is still open.
        if (IONode.get_input('in1')['event_data']['value'] == True):  
            # No, the door is close, reset the time.
            door_open_last_ts = float(read_data_from_global_store("door_open_last_ts"))  
            if (current_ts - door_open_last_ts > DOOR_OPEN_TIME_MAX):  # Send a message that the door is close.
                sendalertmsg = True
                alertmsg = "The medicine box's door was just closed."            
            log (u"Door is closed.  Reset the Door Open's last stored time value.")
            write_data_to_global_store("door_open_last_ts", current_ts)  # reset the time.
            door_open_msg_out = 'false'   # reset to 'false.'
            write_data_to_global_store("door_open_msg_out", door_open_msg_out)                    
        else: 
            log (u"Door is still open.  Don't reset the Door Open's last stored time value.")
elif (device_id != None):
    log (u"Timer Triggered. Check on device status.")
    log (u"Time difference (current_ts - last_ts): {}".format(current_ts - last_ts))
    # online to offline
    if (dev_status == 'online' and (current_ts - last_ts > OFFLINE_TIME_MAX)):  # offline condition
        log (u"Set Stored values to offline if the time difference > {} minutes.".format(OFFLINE_TIME_MAX/60))
        dev_status = 'offline';
        log (u"Device status: {} (save current time in last_ts).".format(dev_status))  
        write_data_to_global_store("dev_status", dev_status)
        write_data_to_global_store("last_ts", current_ts)
        sendalertmsg = True
        alertmsg = "Device went offline. Please check for power and connection issues"
    else:
        if (dev_status == 'online'):
            log (u"Device is online. Check door open time.")
            log (u"Time difference (current_ts - open door last ts): {}".format(current_ts-door_open_last_ts))
            if (current_ts - door_open_last_ts > DOOR_OPEN_TIME_MAX):  
                log (u"Door has been open for over {} minutes.".format(DOOR_OPEN_TIME_MAX/60))
                if (door_open_msg_out == 'true'):
                    log (u"An alert message has been sent.  Don't send any more messages.")    
                else:
                    log (u"Send the alert message now.")                    
                    sendalertmsg = True
                    alertmsg = "Device's door has been open for a long time. Please check the door." 
                    door_open_msg_out = 'true'
                    write_data_to_global_store("door_open_msg_out", door_open_msg_out)                    
            else:
                log (u"Door is closed or open for a little time.")
        else:
            log (u"If the device is offline, it is not possible to check whether the door is still open or not.")
# output_event_template = {
#     "msg":          "Temperature exceeded a safe limit of 50 degrees",
#     "msg_type":     "Alert",                                        # May use other types in future
#     "device_name":  "Temperature Sensor E38",
#     "email":       ["bob@somewhere.com", "joe@somewhereelse.com"],  # optional, string or list of strings
#     "sms":         ["1234567890", "0987654321"],                    # optional, string or list of strings, 10-digit
#     "email_by_id": ["<uuid1>", "<uuid2>"],                          # optional, user_id to be looked up in Store
#     "sms_by_id":   ["<uuid1>", "<uuid1>"],                          # optional, user_id to be looked up in Store
# }
if (sendalertmsg == True and no_phone_for_msg == False):  
    msg_type    = "Alert"
    device_name = "Medicine Door Detection Sensor" + "(" + device_id + ")"
    msg_event = {"msg"      :   alertmsg, 
                "msg_type"  :   msg_type,
                "device_name"   :   device_name,
                "sms"       : sms 
                }
    log (msg_event)
    IONode.set_output("out1", msg_event)        