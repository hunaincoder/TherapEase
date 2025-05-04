const cron = require("node-cron");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const AppointmentModel = require("../models/appointments");
const TransactionModel = require("../models/transaction");

async function updateExpiredAppointments() {
  try {
    if (mongoose.connection.readyState !== 1) {
      console.error(
        "MongoDB not connected. Skipping appointment status update."
      );
      return;
    }

    const now = moment().tz("Asia/Karachi");
    console.log(`Running appointment status update at ${now.format()}`);

    const scheduledAppointments = await AppointmentModel.find({
      status: "Scheduled",
      date: { $lte: now.toDate() },
    });

    console.log(`Found ${scheduledAppointments.length} Scheduled appointments`);

    for (const appointment of scheduledAppointments) {
      const appointmentDate = moment.tz(appointment.date, "Asia/Karachi");
      const appointmentDateTime = moment.tz(
        `${appointmentDate.format("YYYY-MM-DD")} ${appointment.time}`,
        "YYYY-MM-DD HH:mm",
        "Asia/Karachi"
      );

      const appointmentEndTime = moment(appointmentDateTime).add(30, "minutes");

      console.log(`Checking appointment ${appointment._id}:`);
      console.log(`  Start: ${appointmentDateTime.format()}`);
      console.log(`  End: ${appointmentEndTime.format()}`);
      console.log(`  Now: ${now.format()}`);
      console.log(`  Is now after end? ${now.isAfter(appointmentEndTime)}`);

      if (now.isAfter(appointmentEndTime)) {
        appointment.status = "Completed";
        await appointment.save();
        console.log(`Appointment ${appointment._id} marked as Completed`);

        const transaction = await TransactionModel.findOne({
          appointment: appointment._id,
        });
        if (transaction) {
          transaction.status = "completed";
          await transaction.save();
          console.log(
            `Transaction for appointment ${appointment._id} updated to completed`
          );
        } else {
          console.log(
            `No transaction found for appointment ${appointment._id}`
          );
        }
      } else {
        console.log(`Appointment ${appointment._id} not yet expired`);
      }
    }
  } catch (error) {
    console.error("Error updating appointment statuses:", error);
  }
}

const scheduleAppointmentStatusUpdate = () => {
  cron.schedule("* * * * *", () => {
    console.log("Checking for expired appointments...");
    updateExpiredAppointments();
  });
};

module.exports = { scheduleAppointmentStatusUpdate };
