/**
 * LovyanGFX Configuration for Makerfabs ESP32-S3 7" Display
 * 1024x600 IPS with Capacitive Touch (GT911)
 *
 * Board: MaTouch ESP32-S3 Parallel TFT with Touch 7"
 * Display: 7" IPS 1024x600
 * Driver: EK9716 (16-bit parallel RGB)
 * Touch: GT911 (I2C capacitive)
 */

#ifndef LGFX_CONFIG_H
#define LGFX_CONFIG_H

#define LGFX_USE_V1

#include <LovyanGFX.hpp>

class LGFX : public lgfx::LGFX_Device {
    // Panel instance for RGB LCD
    lgfx::Panel_RGB _panel_instance;

    // Bus instance for 16-bit parallel RGB
    lgfx::Bus_RGB _bus_instance;

    // Touch controller
    lgfx::Touch_GT911 _touch_instance;

    // Backlight control
    lgfx::Light_PWM _light_instance;

public:
    LGFX(void) {
        // Bus configuration for 16-bit parallel RGB
        {
            auto cfg = _bus_instance.config();

            cfg.panel = &_panel_instance;
            cfg.freq_write = 14000000;  // 14MHz pixel clock

            // Makerfabs ESP32-S3 7" RGB pins
            // Data pins (directly mapped to GPIO)
            cfg.pin_d0  = GPIO_NUM_8;   // B0
            cfg.pin_d1  = GPIO_NUM_3;   // B1
            cfg.pin_d2  = GPIO_NUM_46;  // B2
            cfg.pin_d3  = GPIO_NUM_9;   // B3
            cfg.pin_d4  = GPIO_NUM_1;   // B4
            cfg.pin_d5  = GPIO_NUM_5;   // G0
            cfg.pin_d6  = GPIO_NUM_6;   // G1
            cfg.pin_d7  = GPIO_NUM_7;   // G2
            cfg.pin_d8  = GPIO_NUM_15;  // G3
            cfg.pin_d9  = GPIO_NUM_16;  // G4
            cfg.pin_d10 = GPIO_NUM_4;   // G5
            cfg.pin_d11 = GPIO_NUM_45;  // R0
            cfg.pin_d12 = GPIO_NUM_48;  // R1
            cfg.pin_d13 = GPIO_NUM_47;  // R2
            cfg.pin_d14 = GPIO_NUM_21;  // R3
            cfg.pin_d15 = GPIO_NUM_14;  // R4

            // Control pins
            cfg.pin_henable = GPIO_NUM_40;  // Horizontal sync enable
            cfg.pin_vsync   = GPIO_NUM_41;  // Vertical sync
            cfg.pin_hsync   = GPIO_NUM_39;  // Horizontal sync
            cfg.pin_pclk    = GPIO_NUM_42;  // Pixel clock

            // Sync timing
            cfg.hsync_polarity    = 0;
            cfg.hsync_front_porch = 8;
            cfg.hsync_pulse_width = 4;
            cfg.hsync_back_porch  = 43;

            cfg.vsync_polarity    = 0;
            cfg.vsync_front_porch = 8;
            cfg.vsync_pulse_width = 4;
            cfg.vsync_back_porch  = 12;

            cfg.pclk_active_neg   = 1;
            cfg.de_idle_high      = 0;
            cfg.pclk_idle_high    = 0;

            _bus_instance.config(cfg);
        }

        // Panel configuration
        {
            auto cfg = _panel_instance.config();

            cfg.memory_width  = 1024;
            cfg.memory_height = 600;
            cfg.panel_width   = 1024;
            cfg.panel_height  = 600;
            cfg.offset_x      = 0;
            cfg.offset_y      = 0;

            _panel_instance.config(cfg);
        }

        // Backlight configuration
        {
            auto cfg = _light_instance.config();

            cfg.pin_bl = GPIO_NUM_2;   // Backlight PWM pin
            cfg.invert = false;
            cfg.freq   = 44100;
            cfg.pwm_channel = 7;

            _light_instance.config(cfg);
            _panel_instance.setLight(&_light_instance);
        }

        // Touch configuration (GT911)
        {
            auto cfg = _touch_instance.config();

            cfg.x_min      = 0;
            cfg.x_max      = 1023;
            cfg.y_min      = 0;
            cfg.y_max      = 599;
            cfg.pin_int    = GPIO_NUM_NC;  // Not connected on some boards
            cfg.pin_rst    = GPIO_NUM_NC;
            cfg.bus_shared = true;
            cfg.offset_rotation = 0;

            // I2C settings for touch
            cfg.i2c_port   = I2C_NUM_0;
            cfg.i2c_addr   = 0x5D;        // GT911 address
            cfg.pin_sda    = GPIO_NUM_17;
            cfg.pin_scl    = GPIO_NUM_18;
            cfg.freq       = 400000;

            _touch_instance.config(cfg);
            _panel_instance.setTouch(&_touch_instance);
        }

        _panel_instance.setBus(&_bus_instance);
        setPanel(&_panel_instance);
    }
};

#endif // LGFX_CONFIG_H
