
#include <WiFi.h>
#include <WebSocketClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <secrets.h>

// Hardware Pin Definitions
const int PIN_LOCK_LED = 4;       // Red LED: Lock Indicator
const int PIN_FLAP_INBOUND = 33;  // Inbound LED
const int PIN_FLAP_OUTBOUND = 23; // Outbound LED
const int PIN_FLAP_TWOWAY = 25;   // Two-Way LED

const int TRIG_PIN = 5;  // Ultrasonic Sensor Trig
const int ECHO_PIN = 32; // Ultrasonic Sensor Echo

// PCA9685 Setup
Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(0x40);
#define SERVO_LEFT_CH 0
#define SERVO_RIGHT_CH 1
#define SERVOMIN 125 // ~0 degrees
#define SERVOMAX 575 // ~180 degrees

// Operational Parameters
const int TRIGGER_DISTANCE_CM = 15; // Trigger door when object closer than 15cm
const int DOOR_OPEN_TIME_MS = 4000; // Hold door open duration

// Global State Tracking

typedef struct
{
    uint8_t flapRule;
    bool isDoorOpen;
} DoorConfig;

DoorConfig doorConfig;


// I use a mutex to prevent a race condition created when the 
// websockets receive the data and update the door system configuration.
SemaphpreHandle_t xDoorConfigMutex;

const char *ssid = SSID;
const char *password = PASSWORD;

const char *supabase_host = SUPABASE_HOST;
const int supabase_port = 443;

WebSocketsCleint websSocket;

void webSocketEvent(WStype_t type, uint8_t *payload, size_t length)
{
    switch (type)
    {
    case WStype_DISCONNECTED:
        Serial.println("[WS] Disconnected!");
        break;
    case WStype_CONNECTED:
        Serial.println("[WS] Connected! Joining channel...");
        // 1. You must join the explicit table topic channel once connected
        // Format: realtime:public:table_name:id=eq.device_id (or just realtime:public:table_name)
        
        // TODO: 
        // Create websocket in Supabase
        // Send update when door fully closes
        // Send update when door  fully opens
        
        webSocket.sendTXT("{\"topic\":\"realtime:public:device_states\",\"event\":\"phx_join\",\"payload\":{},\"ref\":\"1\"}");
        break;
    case WStype_TEXT:

        Serial.printf("[WS] Received text: %s\n", payload);

        // 2. Parse the Phoenix Channel payload
        JsonDocument doc;
        DeserializationError error = deserializeJson(doc, payload);
        if (!error)
        {
            if (xSemaphreTake(xDoorConfigMutex, portMAX_DELAY) == pdTRUE)
            {

                // TODO: 
                // Create table in Supabase
                //
                const char *event = doc["event"]; // e.g., "postgres_changes"

                if (strcmp(event, "postgres_changes") == 0)
                {
                    // Get the new data column values
                    JsonObject record = doc["payload"]["data"]["record"];

                
                    // 3. Act on the state change
                    if(flapRule != record["flap_rule"] || isDoorOpen != record["door_open"]){
                        flapRule = record["flap_rule"].as<int8_t>();
                        isDoorOpen = record["door_open"].as<bool>();

                        updateHardwareOutputs()
                    }

                    
                    
                }
            }
        }
        break;
    }
}

// Convert Angle (0-180) to PCA Pulse
int angleToPulse(int angle)
{
    return map(angle, 0, 180, SERVOMIN, SERVOMAX);
}

// Drive Both Servos to Open or Closed Positions
void setDoorPosition(bool open)
{
    if (open)
    {
        pca.setPWM(SERVO_LEFT_CH, 0, angleToPulse(0));
        pca.setPWM(SERVO_RIGHT_CH, 0, angleToPulse(180));
        isDoorOpen = true;
        Serial.println(" [Servos] Doors Opened");
    }
    else
    {
        pca.setPWM(SERVO_LEFT_CH, 0, angleToPulse(90));
        pca.setPWM(SERVO_RIGHT_CH, 0, angleToPulse(90));
        isDoorOpen = false;
        Serial.println(" [Servos] Doors Closed");
    }
}

// Ultrasonic Sensor Reading
float getDistanceCM()
{
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms Timeout
    if (duration == 0)
        return 999.0;

    return (duration * 0.0343) / 2.0;
}

void setup()
{
    Serial.begin(115200);

    // Initialize Pins
    pinMode(PIN_LOCK_LED, OUTPUT);
    pinMode(PIN_FLAP_INBOUND, OUTPUT);
    pinMode(PIN_FLAP_OUTBOUND, OUTPUT);
    pinMode(PIN_FLAP_TWOWAY, OUTPUT);
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);

    // Initialize PCA9685 PWM Driver
    Wire.begin(21, 22); // SDA=21, SCL=22
    pca.begin();
    pca.setPWMFreq(50);     // Standard 50Hz Servo Frequency
    setDoorPosition(false); // Default closed position

    // Startup Flash Sequence
    digitalWrite(PIN_LOCK_LED, HIGH);
    digitalWrite(PIN_FLAP_INBOUND, HIGH);
    digitalWrite(PIN_FLAP_OUTBOUND, HIGH);
    digitalWrite(PIN_FLAP_TWOWAY, HIGH);
    delay(2000);
    digitalWrite(PIN_LOCK_LED, LOW);
    digitalWrite(PIN_FLAP_INBOUND, LOW);
    digitalWrite(PIN_FLAP_OUTBOUND, LOW);
    digitalWrite(PIN_FLAP_TWOWAY, LOW);

    // WiFi Initialization
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED)
    {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi Connected successfully!");

    // Connect to Supabase via secure SSL WebSocket
    webSocket.beginSSL(supabase_host, supabase_port, supabase_path);
    webSocket.onEvent(webSocketEvent);

    // Reconnect interval if dropped
    webSocket.setReconnectInterval(5000);

    xDoorConfigMutex() = xSemaphoreCreateMutex();
 
    xTaskCreatePinnedToCore(
        checkUltrasonicDoorTrigger,       // Task function
        "UltrasonicSensor",               // Debug name
        2048,                             // Stack size (bytes)
        NULL,                             // Parameter
        1,                                // Priority
        NULL,                             // Task handle
        0                                 // Core ID
    );
}

void loop()
{
    webSocket.loop();

    // Supabase/Phoenix expects a heartbeat ping roughly every 30 seconds
    static unsigned long lastHeartbeat = 0;
    if (millis() - lastHeartbeat > 30000)
    {
        webSocket.sendTXT("{\"topic\":\"phoenix\",\"event\":\"heartbeat\",\"payload\":{},\"ref\":\"2\"}");
        lastHeartbeat = millis();
    }
}

void checkUltrasonicDoorTrigger()
{
    float distance = getDistanceCM();

    if (distance <= TRIGGER_DISTANCE_CM && distance > 0)
    {
        Serial.printf("\n[Sensor] Object Detected! Distance: %.1f cm\n", distance);

        if (windowState == "unlocked")
        {
            if (!isDoorOpen)
            {
                Serial.println(" -> Access Granted: Opening Door...");
                setDoorPosition(true);
                delay(DOOR_OPEN_TIME_MS);

                Serial.println(" -> Auto-Closing Door...");
                setDoorPosition(false);
            }
        }
        else
        {
            Serial.println(" -> Access Denied: System is LOCKED.");

            // Access Denied Warning: Flash Red LED 3 times
            for (int i = 0; i < 3; i++)
            {
                digitalWrite(PIN_LOCK_LED, LOW);
                delay(100);
                digitalWrite(PIN_LOCK_LED, HIGH);
                delay(100);
            }
            // Ensure Red LED returns to SOLID HIGH (Locked state)
            digitalWrite(PIN_LOCK_LED, HIGH);
        }
    }
}


void updateHardwareOutputs()
{
    // 1. Red Lock Indicator LED
    if (windowState == 0)
    {
        digitalWrite(PIN_LOCK_LED, LOW); // LED OFF = Unlocked
        Serial.println(" -> [Hardware] Red LED LOW  (Door Unlocked)");
    }
    else
    {
        digitalWrite(PIN_LOCK_LED, HIGH); // LED ON = Locked
        Serial.println(" -> [Hardware] Red LED HIGH (Door Locked)");
    }

    // 2. Flap Rule Outputs
    if (flapRule == "two_way" || flapRule == "both")
    {
        digitalWrite(PIN_FLAP_INBOUND, LOW);
        digitalWrite(PIN_FLAP_OUTBOUND, LOW);
        digitalWrite(PIN_FLAP_TWOWAY, HIGH);
    }
    else if (flapRule == "outbound_only" || flapRule == "outbound")
    {
        digitalWrite(PIN_FLAP_INBOUND, LOW);
        digitalWrite(PIN_FLAP_OUTBOUND, HIGH);
        digitalWrite(PIN_FLAP_TWOWAY, LOW);
    }
    else
    {
        digitalWrite(PIN_FLAP_INBOUND, HIGH);
        digitalWrite(PIN_FLAP_OUTBOUND, LOW);
        digitalWrite(PIN_FLAP_TWOWAY, LOW);
    }
}